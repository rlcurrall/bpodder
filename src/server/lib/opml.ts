/**
 * Parse OPML content and extract feed URLs.
 * Uses regex-based parsing - OPML structure is simple enough for this approach.
 */

const xmlEntities: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&lt;": "<",
  "&gt;": ">",
  "&apos;": "'",
};

/**
 * Decode XML entities in a string
 */
function decodeXmlEntities(text: string): string {
  return text.replace(/&(?:amp|quot|lt|gt|apos);/g, (match) => xmlEntities[match] ?? match);
}

/**
 * Extract feed URLs from OPML content.
 * Returns an array of URLs found in xmlUrl attributes of outline elements.
 */
export function parseOPML(content: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  // Match outline elements with xmlUrl attribute
  // Handles: <outline type="rss" xmlUrl="..." /> or <outline xmlUrl='...' />
  const outlineRegex = /<outline[^>]*?xmlUrl=["']([^"']+)["'][^>]*?>/gi;

  let match: RegExpExecArray | null;
  while ((match = outlineRegex.exec(content)) !== null) {
    const url = decodeXmlEntities(match[1].trim());
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}
