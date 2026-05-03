# Newsletter Buddy

Personal Telegram bot that triages newsletters into a daily digest and summarizes
YouTube videos on demand. Runs entirely on Cloudflare Workers + D1 (free tier).

> **First time setting this up?** Follow [`ONBOARDING.md`](./ONBOARDING.md) — a
> step-by-step walkthrough from zero to a working bot (~45 min).

## Features

- **Email ingest** — forward newsletters to a dedicated address; the bot extracts
  links, fetches the underlying articles, scores them against your interests, and
  caches everything in D1.
- **Daily digest** — one Telegram message per day grouping articles into ⭐ Must
  read / 📰 Worth a look / 📝 Skim list, each with a short summary and a rationale
  tied to your stated interests.
- **YouTube summaries** — paste a YouTube link in chat; pick **Short summary**
  (TL;DR) or **Learn notes** (study-grade structured notes with flashcards).
- **Single-user** — locked to one Telegram chat ID.

## Architecture

One Cloudflare Worker, three handlers (`fetch`, `email`, `scheduled`), one D1
database. See `/root/.claude/plans/i-want-to-create-snoopy-sky.md` (or your local
plan file) for the full rationale.

```
src/
├── index.ts                # exports { fetch, email, scheduled }
├── env.ts                  # Env type
├── db.ts                   # D1 query helpers
├── interests.ts            # file default + D1 override
├── handlers/
│   ├── email.ts            # parse + persist + waitUntil(processArticles)
│   ├── telegram.ts         # POST /webhook/telegram
│   └── scheduled.ts        # daily digest cron
├── ingest/
│   ├── parser.ts           # postal-mime + link extraction
│   ├── article.ts          # Jina Reader
│   └── youtube.ts          # transcript extraction (no API key)
├── llm/
│   ├── client.ts
│   ├── prompts.ts          # newsletter ranking system prompt + tool schema
│   ├── summarize.ts        # rateArticle()
│   └── youtube_prompts.ts  # short + learn modes
└── bot/
    ├── commands.ts         # grammy bot wiring
    ├── digest.ts           # message composition
    └── youtube_handler.ts  # inline buttons + callback dispatch
```

## One-time setup

### 1. Create the Telegram bot
1. Talk to [@BotFather](https://t.me/BotFather), `/newbot`, save the token.
2. Send `/start` to your bot from your account, then visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the `chat.id`.

### 2. Get a domain on Cloudflare
Cloudflare → Registrar → buy a domain dedicated to the bot
(e.g. `something-bot.com`). DNS is managed by Cloudflare from day one.

### 3. Enable Email Routing
- Cloudflare → Email → Email Routing → enable. MX records auto-configured.
- Catch-all rule `*@yourdomain.tld` → "Send to Worker" → pick `newsletter-buddy`
  (after first deploy).

### 4. Create the D1 database
```sh
npm install
npm run db:create
# Paste the printed `database_id` into wrangler.toml.
npm run db:migrate:remote
```

### 5. Configure secrets
```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_CHAT_ID
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any 16+ char random string
npx wrangler secret put ANTHROPIC_API_KEY
```

Edit `wrangler.toml` vars (`FORWARDING_ADDRESS`, `TIMEZONE`, `DIGEST_HOUR`, etc.).

### 6. Customize your interests
Edit `interests.md`. You can also override at runtime via `/interests set …` in
Telegram.

### 7. Deploy + register webhook
```sh
npm run deploy
TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
  node scripts/set-telegram-webhook.mjs https://newsletter-buddy.<account>.workers.dev
```

### 8. Wire the email route
Cloudflare dashboard → Email → Email Routing → catch-all → "Send to Worker" →
`newsletter-buddy`. Verify with a test send.

## Telegram commands

- `/start` — greeting + setup info
- `/forwarding_address` — show your bot's email address
- `/digest` — send today's digest now
- `/interests` — show current effective interests
- `/interests set <text>` — replace the profile (override)
- `/interests reset` — revert to bundled `interests.md`
- *(paste YouTube URL)* — bot offers Short / Learn buttons

## Daily ops

| Task | Command |
|---|---|
| Tail logs | `npx wrangler tail` |
| D1 console (remote) | `npx wrangler d1 execute newsletter-buddy --remote --command "SELECT count(*) FROM articles WHERE sent_at IS NULL"` |
| Force digest | `/digest` in Telegram |
| Update interests | `/interests set …` in Telegram |

## Costs

Cloudflare (Workers + D1 + Email Routing + Cron) and Jina Reader are free at
this scale. The only running cost is Anthropic API usage:

- Newsletter ranking: ~$0.014–$0.018 per article (Sonnet 4.6, with prompt caching)
- YouTube short summary (1h video): ~$0.04
- YouTube learn notes (1h video): ~$0.07

Light usage typically lands around $5–8/month; moderate use ~$13–15/month.

## Development

```sh
cp .dev.vars.example .dev.vars   # fill in
npm run db:migrate:local
npm run dev                      # wrangler dev with local D1
npm run typecheck
```

The local `wrangler dev` cannot receive real Cloudflare emails. Test the email
path by deploying to Workers and forwarding a real newsletter, or by POSTing a
raw RFC 822 message to the local endpoint manually.
