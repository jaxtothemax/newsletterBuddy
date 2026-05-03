export interface Env {
  DB: D1Database;

  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  ANTHROPIC_API_KEY: string;

  TIMEZONE: string;
  DIGEST_HOUR: string;
  FORWARDING_ADDRESS: string;
  MAX_ARTICLES_PER_NEWSLETTER: string;
  MIN_ARTICLE_WORDS: string;
}
