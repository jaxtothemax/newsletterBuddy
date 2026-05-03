import type { ArticleRow } from "../db.ts";

const TELEGRAM_LIMIT = 4096;

export function buildDigestMessages(articles: ArticleRow[], today: Date): string[] {
  if (articles.length === 0) {
    return [`<b>Daily digest — ${formatDate(today)}</b>\n\nNothing new since yesterday.`];
  }

  const mustRead = articles.filter((a) => a.must_read === 1);
  const worthLook = articles.filter((a) => a.must_read !== 1 && (a.score ?? 0) >= 60);
  const other = articles.filter((a) => a.must_read !== 1 && (a.score ?? 0) < 60);

  const header = `<b>Daily digest — ${formatDate(today)}</b>\n${articles.length} articles across ${
    distinctNewsletterCount(articles)
  } newsletter${distinctNewsletterCount(articles) === 1 ? "" : "s"}\n`;

  const sections: string[] = [];
  if (mustRead.length > 0) {
    sections.push(
      `\n<b>⭐ Must read (${mustRead.length})</b>\n` +
        mustRead.map(renderMustRead).join("\n\n")
    );
  }
  if (worthLook.length > 0) {
    sections.push(
      `\n<b>📰 Worth a look (${worthLook.length})</b>\n` +
        worthLook.map(renderWorthLook).join("\n\n")
    );
  }
  if (other.length > 0) {
    sections.push(
      `\n<b>📝 Skim list (${other.length})</b>\n` + other.map(renderOther).join("\n")
    );
  }

  const full = header + sections.join("\n");
  return splitForTelegram(full);
}

function renderMustRead(a: ArticleRow): string {
  const titleLine = `<a href="${escAttr(a.url)}">${escText(displayTitle(a))}</a>`;
  const rationale = a.rationale ? `\n<i>${escText(a.rationale)}</i>` : "";
  const summary = a.summary ? `\n${escText(a.summary)}` : "";
  return `• ${titleLine}${rationale}${summary}`;
}

function renderWorthLook(a: ArticleRow): string {
  const titleLine = `<a href="${escAttr(a.url)}">${escText(displayTitle(a))}</a>`;
  const summary = a.summary ? `\n${escText(a.summary)}` : "";
  return `• ${titleLine}${summary}`;
}

function renderOther(a: ArticleRow): string {
  return `• <a href="${escAttr(a.url)}">${escText(displayTitle(a))}</a>`;
}

function displayTitle(a: ArticleRow): string {
  return a.title?.trim() || a.url;
}

function distinctNewsletterCount(articles: ArticleRow[]): number {
  return new Set(articles.map((a) => a.newsletter_id).filter((n) => n !== null)).size;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const HTML_ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const escText = (s: string) => s.replace(/[&<>]/g, (c) => HTML_ESC[c] ?? c);
const escAttr = (s: string) => s.replace(/[&<>"]/g, (c) => HTML_ESC[c] ?? c);

/** Split into <=4096-char chunks at paragraph boundaries when possible. */
export function splitForTelegram(text: string): string[] {
  if (text.length <= TELEGRAM_LIMIT) return [text];
  const out: string[] = [];
  let remaining = text;
  while (remaining.length > TELEGRAM_LIMIT) {
    let cut = remaining.lastIndexOf("\n\n", TELEGRAM_LIMIT);
    if (cut < TELEGRAM_LIMIT / 2) cut = remaining.lastIndexOf("\n", TELEGRAM_LIMIT);
    if (cut < TELEGRAM_LIMIT / 2) cut = TELEGRAM_LIMIT;
    out.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) out.push(remaining);
  return out;
}
