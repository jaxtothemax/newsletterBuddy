import { Bot, type Context } from "grammy";
import type { Env } from "../env.ts";
import { getEffectiveInterests, resetInterests, setInterests } from "../interests.ts";
import { findYouTubeUrl } from "../ingest/youtube.ts";
import {
  handleYouTubeCallback,
  offerYouTubeSummary,
  parseYouTubeCallback,
} from "./youtube_handler.ts";
import { sendDigestNow } from "../handlers/scheduled.ts";

export function createBot(env: Env): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const allowedChatId = env.TELEGRAM_CHAT_ID;

  // Single-user lockdown: drop any update whose chat isn't ours.
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id ?? ctx.callbackQuery?.message?.chat.id;
    if (chatId !== undefined && String(chatId) !== allowedChatId) {
      console.log(`[bot] rejecting update from chat ${chatId}`);
      return; // silently ignore
    }
    await next();
  });

  bot.command("start", async (ctx) => {
    await ctx.reply(
      [
        "👋 Newsletter Buddy is online.",
        "",
        `Forward newsletters to: <b>${escapeHtml(env.FORWARDING_ADDRESS)}</b>`,
        `Daily digest at <b>${env.DIGEST_HOUR}:00 ${env.TIMEZONE}</b>.`,
        "",
        "Commands:",
        "• /digest — send today's digest now",
        "• /interests — show current interests",
        "• /interests set &lt;text&gt; — replace your profile",
        "• /interests reset — revert to the bundled default",
        "• /forwarding_address — show the forwarding address",
        "",
        "Paste a YouTube link to get a summary in two flavours.",
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  });

  bot.command("forwarding_address", async (ctx) => {
    await ctx.reply(`Forward to: ${env.FORWARDING_ADDRESS}`);
  });

  bot.command("interests", async (ctx) => {
    const arg = (ctx.match ?? "").toString().trim();
    if (!arg) {
      const current = await getEffectiveInterests(env);
      await ctx.reply(`Current interests profile:\n\n${truncate(current, 3500)}`);
      return;
    }
    const [verb, ...rest] = arg.split(/\s+/);
    if (verb === "set") {
      const text = rest.join(" ").trim();
      if (!text) {
        await ctx.reply("Usage: /interests set <profile text>");
        return;
      }
      await setInterests(env, text);
      await ctx.reply("Interests updated. New profile will be used on the next ranking call.");
      return;
    }
    if (verb === "reset") {
      await resetInterests(env);
      await ctx.reply("Override cleared. Bundled interests.md is back in effect.");
      return;
    }
    await ctx.reply("Usage: /interests | /interests set <text> | /interests reset");
  });

  bot.command("digest", async (ctx) => {
    await ctx.reply("Building digest…");
    const summary = await sendDigestNow(env);
    await ctx.reply(`Digest sent (${summary.articleCount} articles).`);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // already handled
    const match = findYouTubeUrl(text);
    if (match) {
      await offerYouTubeSummary(ctx, env, match);
      return;
    }
    await ctx.reply("Paste a YouTube link or use /digest, /interests, /forwarding_address.");
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const yt = parseYouTubeCallback(data);
    if (yt) {
      await handleYouTubeCallback(ctx as Context, env, yt);
      return;
    }
    await ctx.answerCallbackQuery({ text: "Unknown action." });
  });

  bot.catch((err) => {
    console.error("[bot] error", err);
  });

  return bot;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
}
