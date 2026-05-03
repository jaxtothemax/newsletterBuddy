import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Env } from "../env.ts";
import { getVideo, setVideoSummary, setVideoTranscript, upsertVideo } from "../db.ts";
import { fetchYouTubeTranscript, type YouTubeMatch } from "../ingest/youtube.ts";
import { createAnthropic } from "../llm/client.ts";
import { summarizeVideoLearn, summarizeVideoShort, type VideoMeta } from "../llm/youtube_prompts.ts";
import { splitForTelegram } from "./digest.ts";

export type YouTubeMode = "short" | "learn";

export async function offerYouTubeSummary(ctx: Context, env: Env, match: YouTubeMatch): Promise<void> {
  // Cache the bare row early so the callback has something to find even before transcript fetch.
  await upsertVideo(env, {
    videoId: match.videoId,
    url: match.url,
    title: null,
    channel: null,
    durationSeconds: null,
  });

  const keyboard = new InlineKeyboard()
    .text("📝 Short summary", `yt:short:${match.videoId}`)
    .text("🎓 Learn notes", `yt:learn:${match.videoId}`);

  await ctx.reply(`YouTube video detected.\nPick a summary mode:`, {
    reply_markup: keyboard,
    link_preview_options: { is_disabled: false },
    reply_parameters: ctx.message ? { message_id: ctx.message.message_id } : undefined,
  });
}

const CALLBACK_RE = /^yt:(short|learn):([A-Za-z0-9_-]{11})$/;

export function parseYouTubeCallback(data: string): { mode: YouTubeMode; videoId: string } | null {
  const m = data.match(CALLBACK_RE);
  const mode = m?.[1];
  const videoId = m?.[2];
  if (!mode || !videoId) return null;
  return { mode: mode as YouTubeMode, videoId };
}

export async function handleYouTubeCallback(
  ctx: Context,
  env: Env,
  payload: { mode: YouTubeMode; videoId: string }
): Promise<void> {
  await ctx.answerCallbackQuery();
  const working = await ctx.reply(`Working on the ${payload.mode === "short" ? "short summary" : "learn notes"}…`);

  let video = await getVideo(env, payload.videoId);
  if (!video) {
    await ctx.api.editMessageText(working.chat.id, working.message_id, "Video record missing — please paste the link again.");
    return;
  }

  const cached = payload.mode === "short" ? video.short_summary : video.learn_notes;
  if (cached) {
    await deliver(ctx, env, working.chat.id, working.message_id, payload.mode, cached);
    return;
  }

  if (!video.transcript) {
    const fetched = await fetchYouTubeTranscript(payload.videoId);
    if (!fetched) {
      await ctx.api.editMessageText(
        working.chat.id,
        working.message_id,
        "Couldn't get a transcript for this video (no captions available, age-restricted, or the page format changed)."
      );
      return;
    }
    await upsertVideo(env, {
      videoId: fetched.videoId,
      url: fetched.url,
      title: fetched.title,
      channel: fetched.channel,
      durationSeconds: fetched.durationSeconds,
    });
    await setVideoTranscript(env, fetched.videoId, fetched.transcript);
    video = await getVideo(env, fetched.videoId);
    if (!video || !video.transcript) {
      await ctx.api.editMessageText(working.chat.id, working.message_id, "Transcript fetch succeeded but persist failed.");
      return;
    }
  }

  const meta: VideoMeta = {
    videoId: video.video_id,
    url: video.url,
    title: video.title,
    channel: video.channel,
    durationSeconds: video.duration_seconds,
  };

  const client = createAnthropic(env);
  const summary =
    payload.mode === "short"
      ? await summarizeVideoShort(client, video.transcript, meta)
      : await summarizeVideoLearn(client, video.transcript, meta);

  await setVideoSummary(env, video.video_id, payload.mode, summary);
  await deliver(ctx, env, working.chat.id, working.message_id, payload.mode, summary);
}

async function deliver(
  ctx: Context,
  env: Env,
  chatId: number,
  workingMessageId: number,
  mode: YouTubeMode,
  summary: string
): Promise<void> {
  const header = mode === "short" ? "<b>📝 Short summary</b>" : "<b>🎓 Learn notes</b>";
  const body = mode === "short" ? escapeForShort(summary) : summary; // learn mode already emits HTML
  const full = `${header}\n\n${body}`;
  const chunks = splitForTelegram(full);
  const first = chunks[0]!;
  await ctx.api.editMessageText(chatId, workingMessageId, first, {
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
  for (const chunk of chunks.slice(1)) {
    await ctx.api.sendMessage(chatId, chunk, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  }
}

function escapeForShort(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] ?? c));
}
