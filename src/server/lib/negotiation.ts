type AcceptEntry = {
  mimeType: string;
  q: number;
};

export type SimpleApiResponseFormat = "json" | "jsonp" | "opml" | "txt" | "xml";
export type SimpleApiRequestFormat = "json" | "opml" | "txt";

type SimpleApiFormatResolutionOptions<
  TResponse extends SimpleApiResponseFormat,
  TRequest extends SimpleApiRequestFormat,
> = {
  responseFormats?: readonly TResponse[];
  requestFormats?: readonly TRequest[];
};

const SIMPLE_API_XML_MIME_TYPES = ["application/xml", "text/xml"] as const;
const SIMPLE_API_NEGOTIABLE_MIME_TYPES = {
  json: ["application/json"],
  xml: SIMPLE_API_XML_MIME_TYPES,
} as const;
const SIMPLE_API_REQUEST_MIME_TYPES: Record<SimpleApiRequestFormat, readonly string[]> = {
  json: ["application/json"],
  opml: ["text/x-opml", ...SIMPLE_API_XML_MIME_TYPES],
  txt: ["text/plain"],
};

function parseAcceptHeader(acceptHeader: string | null): AcceptEntry[] {
  if (!acceptHeader) return [];

  return acceptHeader
    .split(",")
    .map((part) => {
      const [rawMimeType, ...params] = part.split(";");
      const mimeType = rawMimeType.trim().toLowerCase();
      let q = 1;

      for (const param of params) {
        const [key, value] = param.split("=");
        if (key?.trim().toLowerCase() !== "q") continue;

        const parsed = Number(value?.trim());
        if (!Number.isNaN(parsed)) {
          q = parsed;
        }
      }

      return { mimeType, q };
    })
    .filter((entry) => entry.mimeType && entry.q > 0)
    .sort((a, b) => b.q - a.q);
}

function matchesMimeType(acceptedMimeType: string, candidateMimeType: string): boolean {
  if (acceptedMimeType === candidateMimeType) return true;
  if (acceptedMimeType === "*/*") return true;

  const [acceptedType, acceptedSubtype] = acceptedMimeType.split("/");
  const [candidateType, candidateSubtype] = candidateMimeType.split("/");

  return (
    acceptedSubtype === "*" && acceptedType === candidateType && candidateSubtype !== undefined
  );
}

function preferredSupportedMimeType(
  headerValue: string | null,
  supportedMimeTypes: readonly string[],
): string | null {
  const acceptedMimeTypes = parseAcceptHeader(headerValue);

  for (const accepted of acceptedMimeTypes) {
    for (const supportedMimeType of supportedMimeTypes) {
      if (matchesMimeType(accepted.mimeType, supportedMimeType)) {
        return supportedMimeType;
      }
    }
  }

  return null;
}

export function negotiateSimpleApiResponseFormat<T extends SimpleApiResponseFormat>(
  req: Request,
  supportedFormats: readonly T[],
): T {
  const pathname = new URL(req.url).pathname.toLowerCase();

  for (const format of supportedFormats) {
    if (pathname.endsWith(`.${format}`)) {
      return format;
    }
  }

  const fallbackFormat = (
    supportedFormats.includes("json" as T) ? "json" : supportedFormats[0]
  ) as T;
  const negotiableFormats = supportedFormats.filter(
    (format): format is Extract<T, "json" | "xml"> => format === "json" || format === "xml",
  );
  const supportedMimeTypes = negotiableFormats.flatMap(
    (format) => SIMPLE_API_NEGOTIABLE_MIME_TYPES[format],
  );
  const matchedMimeType = preferredSupportedMimeType(req.headers.get("Accept"), supportedMimeTypes);

  if (matchedMimeType) {
    for (const format of negotiableFormats) {
      if (SIMPLE_API_NEGOTIABLE_MIME_TYPES[format].includes(matchedMimeType)) {
        return format;
      }
    }
  }

  return fallbackFormat;
}

export function negotiateSimpleApiRequestFormat<T extends SimpleApiRequestFormat>(
  req: Request,
  supportedFormats: readonly T[],
): T {
  const pathname = new URL(req.url).pathname.toLowerCase();
  const supportedMimeTypes = supportedFormats.flatMap(
    (format) => SIMPLE_API_REQUEST_MIME_TYPES[format],
  );
  const matchedMimeType = preferredSupportedMimeType(
    req.headers.get("Content-Type"),
    supportedMimeTypes,
  );

  if (matchedMimeType) {
    for (const format of supportedFormats) {
      if (SIMPLE_API_REQUEST_MIME_TYPES[format].includes(matchedMimeType)) {
        return format;
      }
    }
  }

  for (const format of supportedFormats) {
    if (pathname.endsWith(`.${format}`)) {
      return format;
    }
  }

  return (supportedFormats.includes("json" as T) ? "json" : supportedFormats[0]) as T;
}

export function resolveSimpleApiFormats<
  TResponse extends SimpleApiResponseFormat,
  TRequest extends SimpleApiRequestFormat,
>(
  req: Request,
  { responseFormats, requestFormats }: SimpleApiFormatResolutionOptions<TResponse, TRequest>,
): {
  responseFormat: TResponse | null;
  requestFormat: TRequest | null;
} {
  return {
    responseFormat: responseFormats ? negotiateSimpleApiResponseFormat(req, responseFormats) : null,
    requestFormat: requestFormats ? negotiateSimpleApiRequestFormat(req, requestFormats) : null,
  };
}
