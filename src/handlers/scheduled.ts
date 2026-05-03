import { Bot } from "grammy";
import type { Env } from "../env.ts";
import { getUnsentArticles, markArticlesSent } from "../db.ts";
import { buildDigestMessages } from "../bot/digest.ts";

export interface DigestSendResult {
  articleCount: number;
  messageCount: number;
}

export function shouldSendDigestNow(env: Env, now: Date): boolean {
  const targetHour = Number.parseInt(env.DIGEST_HOUR, 10);
  if (!Number.isFinite(targetHour)) return false;
  const hourInTz = getHourIn(env.TIMEZONE, now);
  return hourInTz === targetHour;
}

export async function runScheduledDigest(env: Env, now: Date): Promise<DigestSendResult | null> {
  if (!shouldSendDigestNow(env, now)) return null;
  return await sendDigestNow(env);
}

export async function sendDigestNow(env: Env): Promise<DigestSendResult> {
  const articles = await getUnsentArticles(env);
  const messages = buildDigestMessages(articles, new Date());
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  for (const m of messages) {
    await bot.api.sendMessage(env.TELEGRAM_CHAT_ID, m, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
  if (articles.length > 0) {
    await markArticlesSent(env, articles.map((a) => a.id));
  }
  return { articleCount: articles.length, messageCount: messages.length };
}

function getHourIn(timeZone: string, date: Date): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hour12: false });
    return Number.parseInt(fmt.format(date), 10);
  } catch {
    return date.getUTCHours();
  }
}
