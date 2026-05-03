#!/usr/bin/env node
// Register the Telegram bot's webhook URL with Telegram.
// Usage:
//   TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
//     node scripts/set-telegram-webhook.mjs https://newsletter-buddy.<acct>.workers.dev

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const baseUrl = process.argv[2];

if (!token || !secret || !baseUrl) {
  console.error("Required: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET env vars and base URL arg.");
  console.error("Example:");
  console.error(
    "  TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy node scripts/set-telegram-webhook.mjs https://your.workers.dev"
  );
  process.exit(1);
}

const webhookUrl = new URL("/webhook/telegram", baseUrl).toString();
const apiUrl = `https://api.telegram.org/bot${token}/setWebhook`;

const res = await fetch(apiUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const body = await res.json();
console.log(JSON.stringify(body, null, 2));
process.exit(body.ok ? 0 : 1);
