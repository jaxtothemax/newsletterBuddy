export interface YouTubeMatch {
  videoId: string;
  url: string;
}

export interface YouTubeTranscript {
  videoId: string;
  url: string;
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
  transcript: string;
}

const YT_URL_RE =
  /https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^\s]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[^\s]*)?/i;

export function findYouTubeUrl(text: string): YouTubeMatch | null {
  const m = text.match(YT_URL_RE);
  const videoId = m?.[1];
  if (!videoId) return null;
  return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

export async function fetchYouTubeTranscript(videoId: string): Promise<YouTubeTranscript | null> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
  const res = await fetch(watchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  const player = extractPlayerResponse(html);
  if (!player) return null;

  const meta = extractMeta(player);
  const tracks = extractCaptionTracks(player);
  const track = chooseTrack(tracks);
  if (!track) return null;

  const transcript = await fetchAndFlattenJson3(track.baseUrl);
  if (!transcript) return null;

  return {
    videoId,
    url: watchUrl.replace("&hl=en", ""),
    title: meta.title,
    channel: meta.channel,
    durationSeconds: meta.durationSeconds,
    transcript,
  };
}

interface PlayerMeta {
  title: string | null;
  channel: string | null;
  durationSeconds: number | null;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
}

function extractPlayerResponse(html: string): unknown | null {
  const markers = ["var ytInitialPlayerResponse = ", "ytInitialPlayerResponse = "];
  for (const marker of markers) {
    const idx = html.indexOf(marker);
    if (idx === -1) continue;
    const start = html.indexOf("{", idx);
    if (start === -1) continue;
    const json = readJsonObject(html, start);
    if (!json) continue;
    try {
      return JSON.parse(json);
    } catch {
      continue;
    }
  }
  return null;
}

/** Walk a JSON object starting at `start` (which must be '{'), respecting strings and escapes. */
function readJsonObject(s: string, start: number): string | null {
  if (s[start] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function extractMeta(player: unknown): PlayerMeta {
  const details = (player as { videoDetails?: Record<string, unknown> })?.videoDetails;
  if (!details) return { title: null, channel: null, durationSeconds: null };
  const title = typeof details.title === "string" ? details.title : null;
  const channel = typeof details.author === "string" ? details.author : null;
  const lengthRaw = details.lengthSeconds;
  const durationSeconds =
    typeof lengthRaw === "string" && /^\d+$/.test(lengthRaw)
      ? Number.parseInt(lengthRaw, 10)
      : typeof lengthRaw === "number"
      ? lengthRaw
      : null;
  return { title, channel, durationSeconds };
}

function extractCaptionTracks(player: unknown): CaptionTrack[] {
  const tracks = (
    (player as { captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: unknown[] } } })?.captions
      ?.playerCaptionsTracklistRenderer?.captionTracks ?? []
  ) as Array<Record<string, unknown>>;
  const out: CaptionTrack[] = [];
  for (const t of tracks) {
    const baseUrl = typeof t.baseUrl === "string" ? t.baseUrl : null;
    const languageCode = typeof t.languageCode === "string" ? t.languageCode : null;
    if (!baseUrl || !languageCode) continue;
    const kind = typeof t.kind === "string" ? t.kind : undefined;
    out.push({ baseUrl, languageCode, kind });
  }
  return out;
}

function chooseTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) return null;
  const manualEn = tracks.find((t) => t.languageCode === "en" && t.kind !== "asr");
  if (manualEn) return manualEn;
  const anyEn = tracks.find((t) => t.languageCode === "en");
  if (anyEn) return anyEn;
  const manualAny = tracks.find((t) => t.kind !== "asr");
  if (manualAny) return manualAny;
  return tracks[0] ?? null;
}

async function fetchAndFlattenJson3(baseUrl: string): Promise<string | null> {
  const url = new URL(baseUrl);
  url.searchParams.set("fmt", "json3");
  try {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
    const parts: string[] = [];
    for (const event of data.events ?? []) {
      if (!event.segs) continue;
      for (const seg of event.segs) {
        if (typeof seg.utf8 === "string" && seg.utf8 !== "\n") {
          parts.push(seg.utf8);
        }
      }
    }
    const joined = parts.join("").replace(/\s+/g, " ").trim();
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}
