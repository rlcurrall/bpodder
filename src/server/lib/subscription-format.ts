import { XMLBuilder } from "fast-xml-parser";
import { z } from "zod/v4";

const ALLOWED_JSONP_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_";

const SubscriptionMetadataSchema = z
  .object({
    title: z.string().optional(),
    website: z.string().optional(),
    author: z.string().optional(),
    description: z.string().optional(),
  })
  .loose();

const subscriptionXmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: true,
});

const opmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
  suppressEmptyNode: false,
});

export function parseSubscriptionMetadata(
  data: string | null,
): z.infer<typeof SubscriptionMetadataSchema> | null {
  if (!data) return null;

  try {
    const result = SubscriptionMetadataSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function dedupeSubscriptionsByUrl<T extends { url: string; data: string | null }>(
  subs: T[],
): T[] {
  const seen = new Map<string, T>();

  for (const sub of subs) {
    const existing = seen.get(sub.url);
    if (!existing) {
      seen.set(sub.url, sub);
    } else if (!existing.data && sub.data) {
      seen.set(sub.url, sub);
    }
  }

  return Array.from(seen.values());
}

export function buildSubscriptionXml(subs: Array<{ url: string; data?: string | null }>): string {
  const podcasts = subs.map((sub) => {
    const metadata = parseSubscriptionMetadata(sub.data ?? null);

    return {
      title: metadata?.title ?? sub.url,
      url: sub.url,
      ...(metadata?.website ? { website: metadata.website } : {}),
      ...(metadata?.author ? { author: metadata.author } : {}),
      ...(metadata?.description ? { description: metadata.description } : {}),
    };
  });

  return subscriptionXmlBuilder.build({
    "?xml": {
      "@_version": "1.0",
      "@_encoding": "UTF-8",
    },
    podcasts: {
      podcast: podcasts,
    },
  });
}

export function buildOpml(subs: Array<{ url: string; data: string | null }>): string {
  const body =
    subs.length === 0
      ? {}
      : {
          outline: subs.map((sub) => {
            const title = parseSubscriptionMetadata(sub.data)?.title ?? sub.url;
            return {
              "@_type": "rss",
              "@_xmlUrl": sub.url,
              "@_title": title,
              "@_text": title,
            };
          }),
        };

  return opmlBuilder.build({
    "?xml": {
      "@_version": "1.0",
      "@_encoding": "UTF-8",
    },
    opml: {
      "@_version": "1.0",
      head: {
        title: "Subscriptions",
      },
      body,
    },
  });
}

export function validateJsonpCallback(
  callback: string | null,
): { valid: true } | { valid: false; error: string } {
  if (!callback) {
    return {
      valid: false,
      error:
        "For a JSONP response, specify the name of the callback function in the jsonp parameter",
    };
  }

  for (const char of callback) {
    if (!ALLOWED_JSONP_CHARS.includes(char)) {
      return {
        valid: false,
        error: `JSONP padding can only contain the characters ${ALLOWED_JSONP_CHARS}`,
      };
    }
  }

  return { valid: true };
}
