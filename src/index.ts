import type { Env } from "./env.ts";
import { ingestInboundEmail, processArticles } from "./handlers/email.ts";
import { runScheduledDigest } from "./handlers/scheduled.ts";
import { handleTelegramWebhook } from "./handlers/telegram.ts";

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return new Response("ok", { status: 200 });
    }

    if (url.pathname === "/webhook/telegram" && req.method === "POST") {
      return handleTelegramWebhook(req, env);
    }

    return new Response("not found", { status: 404 });
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      const { newsletterId, articleIds } = await ingestInboundEmail(message, env);
      console.log(`[email] newsletter ${newsletterId}, ${articleIds.length} articles queued`);
      ctx.waitUntil(
        processArticles(env, newsletterId, articleIds).catch((err) =>
          console.error(`[email] processArticles failed for ${newsletterId}:`, err)
        )
      );
    } catch (err) {
      console.error("[email] ingest failed:", err);
      throw err;
    }
  },

  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const result = await runScheduledDigest(env, new Date());
        if (result) {
          console.log(`[cron] digest sent: ${result.articleCount} articles in ${result.messageCount} messages`);
        } else {
          console.log("[cron] not the digest hour in configured timezone, skipping");
        }
      })()
    );
  },
};
