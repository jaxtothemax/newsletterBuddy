import type Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./client.ts";
import { RANKER_SYSTEM, RATE_ARTICLE_TOOL } from "./prompts.ts";

export interface ArticleVerdict {
  summary: string;
  score: number;
  must_read: boolean;
  rationale: string;
}

export interface ArticleInput {
  url: string;
  title: string | null;
  body: string | null;
}

export async function rateArticle(
  client: Anthropic,
  interests: string,
  article: ArticleInput
): Promise<ArticleVerdict> {
  const userText = formatArticle(article);
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: RANKER_SYSTEM.replace("{INTERESTS}", interests),
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [RATE_ARTICLE_TOOL],
    tool_choice: { type: "tool", name: RATE_ARTICLE_TOOL.name },
    messages: [{ role: "user", content: userText }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === RATE_ARTICLE_TOOL.name) {
      const input = block.input as Partial<ArticleVerdict>;
      return {
        summary: String(input.summary ?? ""),
        score: clampInt(input.score, 0, 100, 0),
        must_read: Boolean(input.must_read),
        rationale: String(input.rationale ?? ""),
      };
    }
  }
  throw new Error("Anthropic response did not contain a rate_article tool_use block");
}

function formatArticle(article: ArticleInput): string {
  const parts = [`URL: ${article.url}`, `Title: ${article.title ?? "(unknown)"}`];
  if (article.body && article.body.trim().length > 0) {
    parts.push("", "Body:", article.body);
  } else {
    parts.push("", "Body: (could not fetch article body)");
  }
  return parts.join("\n");
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}
