// Parse a route param that may contain a file extension.
// e.g. "phone.json" -> { value: "phone", ext: "json" }
// e.g. "alice.opml" -> { value: "alice", ext: "opml" }
// e.g. "login.json" -> { value: "login", ext: "json" }
// e.g. "alice"      -> { value: "alice", ext: "" }
export function parseParam(raw: string): { value: string; ext: string } {
  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex === -1) {
    return { value: raw, ext: "" };
  }
  return {
    value: raw.slice(0, dotIndex),
    ext: raw.slice(dotIndex + 1),
  };
}
