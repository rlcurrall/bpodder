export function clsx(...classes: (unknown | unknown[])[]): string {
  return classes
    .flat()
    .map((c) => (c == null ? "" : String(c)))
    .filter((c): c is string => c.length > 0)
    .join(" ");
}
