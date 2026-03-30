import type { Logger } from "@server/lib/logger";

const xmlEntities: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&apos;": "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&(?:amp|quot|lt|gt|apos);/g, (match) => xmlEntities[match] ?? match);
}

function stripCdata(text: string): string {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function extractText(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(re);
  if (!match) return null;
  return decodeXmlEntities(stripCdata(match[1])).trim() || null;
}

function truncateBeforeFirstItem(xml: string): string {
  const candidates = [/<item[\s>]/i, /<entry[\s>]/i]
    .map((r) => xml.search(r))
    .filter((i) => i !== -1);
  return candidates.length ? xml.slice(0, Math.min(...candidates)) : xml;
}

function parseImageUrl(xml: string): string | null {
  const itunesMatch = xml.match(/<itunes:image[^>]+href=["']([^"']+)["']/i);
  if (itunesMatch) return decodeXmlEntities(itunesMatch[1].trim());

  const imageBlock = xml.match(/<image[^>]*>([\s\S]*?)<\/image>/i);
  if (imageBlock) {
    const urlMatch = imageBlock[1].match(/<url[^>]*>([\s\S]*?)<\/url>/i);
    if (urlMatch) return decodeXmlEntities(stripCdata(urlMatch[1])).trim() || null;
  }

  return null;
}

async function _fetchFeed(db: AppDatabase, logger: Logger, url: string): Promise<void> {
  const now = Math.floor(Date.now() / 1000);

  const existing = db.first<{ next_fetch_after: number; fetch_failures: number }>(
    "SELECT next_fetch_after, fetch_failures FROM feeds WHERE feed_url = ?",
    url,
  );
  if (existing && existing.next_fetch_after > now) {
    return;
  }

  let xml: string;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "bpodder/1.0" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    xml = await res.text();
  } catch (err) {
    logger.warn({ err, url }, "feed fetch failed");
    const prevFailures = existing?.fetch_failures ?? 0;
    const backoff = Math.min((prevFailures + 1) * 3600, 86400);
    db.run(
      `INSERT INTO feeds (feed_url, last_fetch, fetch_failures, next_fetch_after)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(feed_url) DO UPDATE SET
         fetch_failures = fetch_failures + 1,
         next_fetch_after = ?`,
      url,
      now,
      prevFailures + 1,
      now + backoff,
      now + backoff,
    );
    return;
  }

  const truncated = truncateBeforeFirstItem(xml);
  const title = extractText(truncated, "title");
  const imageUrl = parseImageUrl(truncated);
  const description = extractText(truncated, "subtitle") ?? extractText(truncated, "description");

  const clamp = (s: string | null, max: number): string | null => (s ? s.slice(0, max) : null);

  db.run(
    `INSERT INTO feeds (feed_url, title, image_url, description, last_fetch, fetch_failures, next_fetch_after)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(feed_url) DO UPDATE SET
       title = excluded.title,
       image_url = excluded.image_url,
       description = excluded.description,
       last_fetch = excluded.last_fetch,
       fetch_failures = 0,
       next_fetch_after = excluded.next_fetch_after`,
    url,
    clamp(title, 255),
    clamp(imageUrl, 1024),
    clamp(description, 4096),
    now,
    now + 3600,
  );

  const feed = db.first<{ id: number }>("SELECT id FROM feeds WHERE feed_url = ?", url);
  if (feed) {
    db.run("UPDATE subscriptions SET feed = ? WHERE url = ? AND feed IS NULL", feed.id, url);
  }

  logger.debug({ url, title }, "feed fetched");
}

export function backgroundFetchFeed(db: AppDatabase, logger: Logger, url: string): void {
  void _fetchFeed(db, logger, url);
}
