export interface FetchedArticle {
  url: string;
  title: string | null;
  body: string | null;
  wordCount: number;
}

export async function fetchArticle(url: string): Promise<FetchedArticle> {
  const jinaUrl = "https://r.jina.ai/" + url;
  try {
    const res = await fetch(jinaUrl, {
      headers: {
        Accept: "text/markdown",
        "X-Return-Format": "markdown",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { url, title: null, body: null, wordCount: 0 };
    }
    const text = (await res.text()).trim();
    if (!text || text.length < 100) {
      return { url, title: null, body: null, wordCount: 0 };
    }
    const { title, body } = splitTitleAndBody(text);
    const wordCount = countWords(body);
    return { url, title, body, wordCount };
  } catch {
    return { url, title: null, body: null, wordCount: 0 };
  }
}

/**
 * Jina Reader's Markdown output starts with a metadata block:
 *   Title: ...
 *   URL Source: ...
 *   Markdown Content:
 *   ...
 * Strip that and split the title from the body.
 */
function splitTitleAndBody(markdown: string): { title: string | null; body: string } {
  let title: string | null = null;
  let body = markdown;
  const titleMatch = markdown.match(/^Title:\s*(.+)$/m);
  if (titleMatch?.[1]) title = titleMatch[1].trim();
  const split = markdown.split(/^Markdown Content:\s*$/m);
  if (split.length > 1) body = (split[1] ?? "").trim();
  return { title, body };
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Process items in chunks of `concurrency`, returning results in original order. */
export async function batched<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(slice.map(worker));
    settled.forEach((s, j) => {
      if (s.status === "fulfilled") {
        results[i + j] = s.value;
      } else {
        throw s.reason;
      }
    });
  }
  return results;
}
