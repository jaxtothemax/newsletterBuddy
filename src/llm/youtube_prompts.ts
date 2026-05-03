import type Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./client.ts";

export interface VideoMeta {
  videoId: string;
  url: string;
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
}

const SHORT_SYSTEM = `You write concise TL;DRs of YouTube talks for a busy reader.
Output format (Telegram-friendly, no Markdown headers):
- 4-6 bullet points capturing the main claims, in the order they appear
- One blank line, then "Resources mentioned:" followed by a bulleted list of any concrete links/books/papers/tools cited (omit the section if none)
- One blank line, then a single line: "Worth watching in full? <yes/no/skim> — <one-clause reason>"

Hard limits: ≤ 300 words total. No preamble, no closing remarks. Use plain text bullets ("• ").`;

const LEARN_SYSTEM = `You write structured study notes from YouTube talks, designed to maximize retention.
Output format (Telegram HTML; use <b> for section headings, no other tags except <a>):

<b>Core concepts</b>
• <concept>: <one-sentence definition in your own words>

<b>Key arguments / claims</b>
1. <claim> — <the supporting reasoning given in the video>

<b>Examples & analogies used</b>
• <example> → illustrates <concept>

<b>Practical takeaways</b>
• <action, heuristic, or pattern the viewer should remember>

<b>Open questions for further study</b>
• <question prompted by the video>

<b>Spaced-repetition flashcards</b>
• Q: <question> — A: <answer in ≤ 20 words>

Rules:
- Cover the actual content of the video — do not pad with generic advice.
- 5-10 flashcards, focused on the most testable facts.
- Section is omitted entirely if the video has no content for it.
- No preamble, no closing remarks.`;

function userText(transcript: string, meta: VideoMeta): string {
  const head = [
    `Title: ${meta.title ?? "(unknown)"}`,
    `Channel: ${meta.channel ?? "(unknown)"}`,
    meta.durationSeconds ? `Duration: ${formatDuration(meta.durationSeconds)}` : null,
    `URL: ${meta.url}`,
  ]
    .filter((s): s is string => s !== null)
    .join("\n");
  return `${head}\n\nTranscript:\n${transcript}`;
}

export async function summarizeVideoShort(
  client: Anthropic,
  transcript: string,
  meta: VideoMeta
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 800,
    system: [{ type: "text", text: SHORT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText(transcript, meta), cache_control: { type: "ephemeral" } },
        ],
      },
    ],
  });
  return extractText(response.content);
}

export async function summarizeVideoLearn(
  client: Anthropic,
  transcript: string,
  meta: VideoMeta
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: "text", text: LEARN_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: userText(transcript, meta), cache_control: { type: "ephemeral" } },
        ],
      },
    ],
  });
  return extractText(response.content);
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m${String(s).padStart(2, "0")}s`;
}
