import type { Env } from "../env.ts";
import { insertArticles, insertNewsletter, markNewsletterProcessed, updateArticleSummary } from "../db.ts";
import { batched, fetchArticle } from "../ingest/article.ts";
import { extractLinks, parseEmail } from "../ingest/parser.ts";
import { getEffectiveInterests } from "../interests.ts";
import { createAnthropic } from "../llm/client.ts";
import { rateArticle } from "../llm/summarize.ts";

export interface IngestResult {
  newsletterId: number;
  articleIds: number[];
}

export async function ingestInboundEmail(message: ForwardableEmailMessage, env: Env): Promise<IngestResult> {
  const parsed = await parseEmail(message.raw);
  const newsletterId = await insertNewsletter(env, {
    sourceAddress: parsed.from ?? message.from,
    subject: parsed.subject,
    html: parsed.html,
    text: parsed.text,
  });

  if (!parsed.html) {
    await markNewsletterProcessed(env, newsletterId);
    return { newsletterId, articleIds: [] };
  }

  const maxLinks = Number.parseInt(env.MAX_ARTICLES_PER_NEWSLETTER, 10) || 12;
  const links = extractLinks(parsed.html, { maxLinks });
  const articleRows = await insertArticles(env, newsletterId, links);
  return { newsletterId, articleIds: articleRows.map((r) => r.id) };
}

export async function processArticles(env: Env, newsletterId: number, articleIds: number[]): Promise<void> {
  if (articleIds.length === 0) {
    await markNewsletterProcessed(env, newsletterId);
    return;
  }

  const placeholders = articleIds.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT id, url, title FROM articles WHERE id IN (${placeholders})`
  )
    .bind(...articleIds)
    .all<{ id: number; url: string; title: string | null }>();
  const rows = result.results ?? [];

  const interests = await getEffectiveInterests(env);
  const client = createAnthropic(env);
  const minWords = Number.parseInt(env.MIN_ARTICLE_WORDS, 10) || 0;

  const fetched = await batched(rows, 4, (row) => fetchArticle(row.url));

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const article = fetched[i]!;
    if (article.body && article.wordCount < minWords) {
      await updateArticleSummary(env, row.id, {
        fetchedText: article.body,
        summary: `Skipped: only ${article.wordCount} words after extraction (likely a promo or stub).`,
        score: 10,
        mustRead: false,
        rationale: `Below the ${minWords}-word threshold for ranking.`,
      });
      continue;
    }
    try {
      const verdict = await rateArticle(client, interests, {
        url: row.url,
        title: article.title ?? row.title,
        body: article.body,
      });
      await updateArticleSummary(env, row.id, {
        fetchedText: article.body,
        summary: verdict.summary,
        score: verdict.score,
        mustRead: verdict.must_read,
        rationale: verdict.rationale,
      });
    } catch (err) {
      console.error(`[process] article ${row.id} (${row.url}) failed:`, err);
    }
  }

  await markNewsletterProcessed(env, newsletterId);
}
