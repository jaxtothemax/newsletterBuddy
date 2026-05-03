import PostalMime from "postal-mime";

export interface ParsedNewsletter {
  from: string | null;
  subject: string | null;
  html: string | null;
  text: string | null;
}

export async function parseEmail(raw: ReadableStream<Uint8Array> | ArrayBuffer | string): Promise<ParsedNewsletter> {
  const parser = new PostalMime();
  const email = await parser.parse(raw);
  const fromAddr = email.from?.address ?? null;
  const fromName = email.from?.name ?? null;
  const from = fromAddr ? (fromName ? `${fromName} <${fromAddr}>` : fromAddr) : null;
  return {
    from,
    subject: email.subject ?? null,
    html: email.html ?? null,
    text: email.text ?? null,
  };
}

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "utm_brand",
  "utm_channel",
  "mc_cid",
  "mc_eid",
  "mkt_tok",
  "fbclid",
  "gclid",
  "igshid",
  "vero_id",
  "vero_conv",
  "ck_subscriber_id",
  "ref",
  "ref_src",
  "_branch_match_id",
]);

const SKIP_HOSTS = [
  "unsubscribe",
  "list-manage.com",
  "beehiiv.com/p/track",
  "substack.com/email/",
  "convertkit-mail",
  "ck.page/c/",
  "twitter.com/intent",
  "x.com/intent",
  "facebook.com/sharer",
  "linkedin.com/sharing",
  "linkedin.com/shareArticle",
  "reddit.com/submit",
  "mailto:",
  "addtoany.com",
  "share.flipboard.com",
  "pinterest.com/pin/create",
  "click.convertkit",
  "click.mailerlite",
  "track.smtpcorp",
  "click.linksynergy",
];

const SKIP_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".css", ".js"];

const HREF_RE = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

export interface ExtractedLink {
  url: string;
  title: string | null;
}

export function extractLinks(html: string, opts: { maxLinks: number }): ExtractedLink[] {
  const seen = new Map<string, ExtractedLink>();
  for (const match of html.matchAll(HREF_RE)) {
    const rawHref = match[1];
    const rawText = match[2];
    if (!rawHref) continue;
    const href = decodeEntities(rawHref).trim();
    if (!href) continue;
    if (!/^https?:\/\//i.test(href)) continue;
    const cleaned = cleanUrl(href);
    if (!cleaned) continue;
    if (shouldSkip(cleaned)) continue;
    if (seen.has(cleaned)) continue;
    const title = extractText(rawText ?? "").trim() || null;
    seen.set(cleaned, { url: cleaned, title });
  }
  return Array.from(seen.values()).slice(0, opts.maxLinks);
}

function cleanUrl(input: string): string | null {
  try {
    const url = new URL(input);
    for (const key of Array.from(url.searchParams.keys())) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function shouldSkip(url: string): boolean {
  const lower = url.toLowerCase();
  if (SKIP_HOSTS.some((needle) => lower.includes(needle))) return true;
  if (SKIP_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  return false;
}

function extractText(htmlFragment: string): string {
  return htmlFragment.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
}
