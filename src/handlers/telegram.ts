import { webhookCallback } from "grammy";
import type { Env } from "../env.ts";
import { createBot } from "../bot/commands.ts";

export async function handleTelegramWebhook(req: Request, env: Env): Promise<Response> {
  const provided = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (provided !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response("forbidden", { status: 403 });
  }
  const bot = createBot(env);
  const handler = webhookCallback(bot, "cloudflare-mod");
  return handler(req);
}
