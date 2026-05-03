import type { Env } from "./env.ts";

export interface NewsletterRow {
  id: number;
  source_address: string | null;
  subject: string | null;
  received_at: number;
  html_body: string | null;
  text_body: string | null;
  processed_at: number | null;
}

export interface ArticleRow {
  id: number;
  newsletter_id: number | null;
  url: string;
  title: string | null;
  fetched_text: string | null;
  summary: string | null;
  score: number | null;
  must_read: number;
  rationale: string | null;
  created_at: number;
  sent_at: number | null;
}

export interface VideoRow {
  id: number;
  video_id: string;
  url: string;
  title: string | null;
  channel: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  short_summary: string | null;
  learn_notes: string | null;
  requested_at: number;
}

export const nowSec = () => Math.floor(Date.now() / 1000);

export async function insertNewsletter(
  env: Env,
  args: { sourceAddress: string | null; subject: string | null; html: string | null; text: string | null }
): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO newsletters (source_address, subject, received_at, html_body, text_body)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(args.sourceAddress, args.subject, nowSec(), args.html, args.text)
    .run();
  const id = result.meta.last_row_id;
  if (typeof id !== "number") throw new Error("D1 did not return last_row_id for newsletter insert");
  return id;
}

export async function markNewsletterProcessed(env: Env, newsletterId: number): Promise<void> {
  await env.DB.prepare(`UPDATE newsletters SET processed_at = ? WHERE id = ?`)
    .bind(nowSec(), newsletterId)
    .run();
}

/** Insert articles, ignoring duplicates by URL. Returns the inserted rows in order. */
export async function insertArticles(
  env: Env,
  newsletterId: number,
  articles: Array<{ url: string; title: string | null }>
): Promise<ArticleRow[]> {
  if (articles.length === 0) return [];
  const ts = nowSec();
  const stmts = articles.map((a) =>
    env.DB.prepare(
      `INSERT OR IGNORE INTO articles (newsletter_id, url, title, created_at)
       VALUES (?, ?, ?, ?)`
    ).bind(newsletterId, a.url, a.title, ts)
  );
  await env.DB.batch(stmts);
  const placeholders = articles.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT * FROM articles WHERE url IN (${placeholders}) AND newsletter_id = ?`
  )
    .bind(...articles.map((a) => a.url), newsletterId)
    .all<ArticleRow>();
  return result.results ?? [];
}

export async function updateArticleSummary(
  env: Env,
  id: number,
  args: { fetchedText: string | null; summary: string; score: number; mustRead: boolean; rationale: string }
): Promise<void> {
  await env.DB.prepare(
    `UPDATE articles
     SET fetched_text = ?, summary = ?, score = ?, must_read = ?, rationale = ?
     WHERE id = ?`
  )
    .bind(args.fetchedText, args.summary, args.score, args.mustRead ? 1 : 0, args.rationale, id)
    .run();
}

export async function getUnsentArticles(env: Env): Promise<ArticleRow[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM articles
     WHERE sent_at IS NULL AND summary IS NOT NULL
     ORDER BY score DESC NULLS LAST, id ASC`
  ).all<ArticleRow>();
  return result.results ?? [];
}

export async function markArticlesSent(env: Env, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const ts = nowSec();
  const placeholders = ids.map(() => "?").join(",");
  await env.DB.prepare(`UPDATE articles SET sent_at = ? WHERE id IN (${placeholders})`)
    .bind(ts, ...ids)
    .run();
}

export async function getInterestsOverride(env: Env): Promise<string | null> {
  const row = await env.DB.prepare(`SELECT profile_text FROM interests_override WHERE id = 1`).first<{
    profile_text: string;
  }>();
  return row?.profile_text ?? null;
}

export async function setInterestsOverride(env: Env, text: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO interests_override (id, profile_text, updated_at)
     VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET profile_text = excluded.profile_text, updated_at = excluded.updated_at`
  )
    .bind(text, nowSec())
    .run();
}

export async function clearInterestsOverride(env: Env): Promise<void> {
  await env.DB.prepare(`DELETE FROM interests_override WHERE id = 1`).run();
}

export async function getVideo(env: Env, videoId: string): Promise<VideoRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM videos WHERE video_id = ?`).bind(videoId).first<VideoRow>();
  return row ?? null;
}

export async function upsertVideo(
  env: Env,
  args: { videoId: string; url: string; title: string | null; channel: string | null; durationSeconds: number | null }
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO videos (video_id, url, title, channel, duration_seconds, requested_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET
       url = excluded.url,
       title = COALESCE(videos.title, excluded.title),
       channel = COALESCE(videos.channel, excluded.channel),
       duration_seconds = COALESCE(videos.duration_seconds, excluded.duration_seconds)`
  )
    .bind(args.videoId, args.url, args.title, args.channel, args.durationSeconds, nowSec())
    .run();
}

export async function setVideoTranscript(env: Env, videoId: string, transcript: string): Promise<void> {
  await env.DB.prepare(`UPDATE videos SET transcript = ? WHERE video_id = ?`).bind(transcript, videoId).run();
}

export async function setVideoSummary(
  env: Env,
  videoId: string,
  mode: "short" | "learn",
  summary: string
): Promise<void> {
  const column = mode === "short" ? "short_summary" : "learn_notes";
  await env.DB.prepare(`UPDATE videos SET ${column} = ? WHERE video_id = ?`).bind(summary, videoId).run();
}
