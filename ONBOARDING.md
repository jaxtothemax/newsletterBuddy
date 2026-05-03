# Onboarding — from zero to a working bot

Sequential walkthrough. Do steps in order; each one has a verify check.
Estimated time end-to-end: **~45 minutes** (plus DNS propagation if a new domain).

---

## 0. Prerequisites

You need:
- A computer with **Node.js ≥ 22** and **git**
- A **Cloudflare account** (free is fine)
- A **Telegram account** on your phone
- An **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com) → API keys)
- A credit card (only for the Cloudflare domain — ~$10/yr; nothing else costs money up front)

```sh
node --version    # should print v22.x or higher
git --version
```

---

## 1. Clone the repo and install dependencies

```sh
git clone <your-repo-url> newsletterBuddy
cd newsletterBuddy
npm install
```

**Verify:** `node_modules/` exists and `npm run typecheck` exits with no output.

---

## 2. Log into Cloudflare from the CLI

```sh
npx wrangler login
```

A browser tab opens; click **Allow**. Wrangler stores the OAuth token locally.

**Verify:**
```sh
npx wrangler whoami
```
Should print your Cloudflare account email and account ID.

---

## 3. Buy a dedicated domain on Cloudflare

This domain exists only for the bot — keeps it isolated from any other DNS you run.

1. Cloudflare dashboard → **Registrar** (left sidebar) → **Register Domains**.
2. Search for something short and forgettable (e.g. `mybuddy-mail.com`). `.com` is ~$10/yr at-cost.
3. Complete checkout. The domain is added to your account with Cloudflare-managed DNS automatically.

**Verify:** the new domain appears in **Websites** in the dashboard, status "Active" within a few minutes.

> If you'd rather not buy a domain right now, you can still complete steps 4–11 with placeholder values and come back to set up email later. The Telegram + YouTube features work without it.

---

## 4. Create the Telegram bot

1. On your phone, open Telegram and message [@BotFather](https://t.me/BotFather).
2. Send `/newbot`. Follow prompts to pick a name (display name) and username (must end in `bot`, e.g. `mybuddy_news_bot`).
3. **Copy and save the bot token** BotFather sends back — looks like `1234567890:ABCdef…`.

**Get your personal chat ID:**
1. In Telegram, search for your bot by username and send it any message (e.g. `hi`).
2. In a browser, visit:
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
   Replace `<YOUR_TOKEN>` with the BotFather token.
3. Find `"chat":{"id":123456789` in the JSON. **Save that number** — that's your `TELEGRAM_CHAT_ID`.

**Verify:** you have two values written down: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

---

## 5. Create the D1 database

```sh
npm run db:create
```

Output will include a block like:
```
[[d1_databases]]
binding = "DB"
database_name = "newsletter-buddy"
database_id = "abc12345-6789-..."
```

**Open `wrangler.toml`** and replace `REPLACE_WITH_ID_FROM_wrangler_d1_create` with the printed `database_id`.

Then apply the schema:
```sh
npm run db:migrate:remote
```

**Verify:**
```sh
npx wrangler d1 execute newsletter-buddy --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
```
Should list: `newsletters`, `articles`, `interests_override`, `videos`, plus a `d1_migrations` table.

---

## 6. Customize `wrangler.toml`

Open `wrangler.toml` and edit the `[vars]` block:

```toml
[vars]
TIMEZONE = "Europe/Warsaw"           # your IANA timezone
DIGEST_HOUR = "8"                    # 0-23, when daily digest is sent
FORWARDING_ADDRESS = "you@yourdomain.tld"   # the address you'll forward newsletters to
MAX_ARTICLES_PER_NEWSLETTER = "12"
MIN_ARTICLE_WORDS = "300"
```

Use your bought domain from step 3 for `FORWARDING_ADDRESS`. The local part can be anything (e.g. `bot@`, `news@`, `hi@`) — the catch-all rule in step 10 will accept any address on the domain.

> The cron in `wrangler.toml` is `0 7 * * *` (07:00 UTC). Combined with your `TIMEZONE` + `DIGEST_HOUR`, the bot only sends when the local hour matches. So pick a UTC cron hour that's at-or-before any local hour you'd ever want.

---

## 7. Customize your interests

Open `interests.md` and replace its contents with what you actually care about.
The more specific, the better the ranking.

You can change this later either by editing the file and redeploying, or live in
Telegram with `/interests set <text>`.

---

## 8. Set the four secrets

Run each command. Wrangler will prompt for the value (paste, then Enter):

```sh
npx wrangler secret put TELEGRAM_BOT_TOKEN          # paste BotFather token
npx wrangler secret put TELEGRAM_CHAT_ID            # paste your chat ID number
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET     # any 16+ char random string
npx wrangler secret put ANTHROPIC_API_KEY           # sk-ant-...
```

For `TELEGRAM_WEBHOOK_SECRET`, generate something random:
```sh
node -e "console.log(crypto.randomBytes(24).toString('hex'))"
```
**Save that value** — you'll need it again in step 10.

**Verify:**
```sh
npx wrangler secret list
```
Should list all four secret names.

---

## 9. First deploy

```sh
npm run deploy
```

Output ends with a public URL like:
```
https://newsletter-buddy.<your-subdomain>.workers.dev
```
**Copy that URL** — you'll use it next.

**Verify:**
```sh
curl https://newsletter-buddy.<your-subdomain>.workers.dev/healthz
```
Should print `ok`.

---

## 10. Register the Telegram webhook

```sh
TELEGRAM_BOT_TOKEN='<your-token>' \
TELEGRAM_WEBHOOK_SECRET='<the-same-random-string-from-step-8>' \
node scripts/set-telegram-webhook.mjs https://newsletter-buddy.<your-subdomain>.workers.dev
```

**Verify:** output ends with `"ok": true` and `"description": "Webhook was set"`.

Now in Telegram, message your bot:
```
/start
```

You should get a greeting reply within a couple seconds.

> If `/start` doesn't reply, run `npx wrangler tail` in another terminal and try again — the logs will show whether the webhook hit and where it failed (most likely a missing secret or a wrong chat ID).

---

## 11. Enable Email Routing → Worker

1. Cloudflare dashboard → pick the domain you bought in step 3.
2. Sidebar → **Email** → **Email Routing** → click **Enable Email Routing**. Cloudflare will auto-add the required MX + SPF records (you'll be asked to confirm).
3. **Routes** tab → enable **Catch-all address**.
4. Edit the catch-all rule:
   - **Action:** *Send to a Worker*
   - **Destination:** `newsletter-buddy`
5. Save.

**Verify with a real test:**
1. From any inbox, send an email to **anything@yourdomain.tld** (e.g. `test@mybuddy-mail.com`) with a few HTML links in the body. Newsletters work best — try forwarding one you got recently.
2. In another terminal:
   ```sh
   npx wrangler tail
   ```
   Within ~30 seconds you should see logs like:
   ```
   [email] newsletter 1, 8 articles queued
   ```
3. Check D1:
   ```sh
   npx wrangler d1 execute newsletter-buddy --remote --command "SELECT count(*) FROM articles"
   ```
   Count should match the queued number. Wait another ~60s for summaries:
   ```sh
   npx wrangler d1 execute newsletter-buddy --remote --command "SELECT count(*) FROM articles WHERE summary IS NOT NULL"
   ```

---

## 12. Trigger your first digest manually

In Telegram, send:
```
/digest
```

You should get a Telegram message titled **Daily digest — YYYY-MM-DD** with sections for Must-read / Worth-a-look / Skim list. Tap any link — should open the original article (no tracker URL).

**Verify the daily cron is registered** for tomorrow morning:
```sh
npx wrangler deployments list
```
The cron `0 7 * * *` is shown in `wrangler.toml`; Workers Analytics in the dashboard will show scheduled invocations after the first fire.

---

## 13. Try the YouTube feature

In Telegram, paste any YouTube URL with captions, e.g.:
```
https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

The bot replies with the title and two inline buttons. Tap **Short summary** — within ~15s you should get a TL;DR. Tap **Learn notes** on the same message — you'll get structured study notes with flashcards (transcript is cached, so this second call only pays for Claude, not for re-fetching from YouTube).

**Verify:**
```sh
npx wrangler d1 execute newsletter-buddy --remote --command "SELECT video_id, title, length(transcript) AS tlen, length(short_summary) AS slen, length(learn_notes) AS llen FROM videos"
```

---

## You're done

From here on:
- Subscribe to newsletters using your `you@yourdomain.tld` address, or set up email forwarding from your normal inbox to it.
- Every morning at your configured `DIGEST_HOUR` you'll get a Telegram message.
- Use `/interests set <text>` to refine ranking as you notice misses.
- Paste any YouTube link to get summaries on demand.

## Common pitfalls

| Symptom | Likely cause |
|---|---|
| `/start` no reply | Webhook not set, wrong `TELEGRAM_WEBHOOK_SECRET`, or `TELEGRAM_CHAT_ID` mismatch — `npx wrangler tail` will show the rejected update. |
| Email arrives but no articles in D1 | Routing is set to "Send to email" instead of "Send to Worker" — double-check the catch-all rule. |
| Articles inserted but no summaries | `ANTHROPIC_API_KEY` invalid / expired, or out of credits. Check `wrangler tail`. |
| YouTube "no transcript available" | Video has no captions, is age-restricted, or is private. Try a different one (most TED talks, conference talks, podcast uploads have captions). |
| Digest is empty every morning | Either no articles received yet, or `DIGEST_HOUR`/`TIMEZONE` don't match the cron's UTC time. With cron `0 7 * * *`, set `TIMEZONE` and `DIGEST_HOUR` so the local hour computed from 07:00 UTC equals `DIGEST_HOUR`. |

## Updating later

Edit code → `npm run deploy`. That's the whole loop. Migrations: add a new `migrations/000N_*.sql` file → `npm run db:migrate:remote`.
