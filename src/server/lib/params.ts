// Strip a known file extension from a route param.
// e.g. "phone.json" -> { value: "phone", ext: "json" }
// e.g. "alice.opml" -> { value: "alice", ext: "opml" }
// e.g. "login.json" -> { value: "login", ext: "json" }
// e.g. "alice"      -> { value: "alice", ext: "" }
export function stripExtension(
  raw: string,
  knownExts?: readonly string[],
): { value: string; ext: string } {
  const dotIndex = raw.lastIndexOf(".");
  if (dotIndex === -1) {
    return { value: raw, ext: "" };
  }

  const ext = raw.slice(dotIndex + 1);
  if (knownExts && !knownExts.includes(ext)) {
    return { value: raw, ext: "" };
  }

  return {
    value: raw.slice(0, dotIndex),
    ext,
  };
}
