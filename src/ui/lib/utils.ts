type ClassValue = string | number | boolean | undefined | null;
export function clsx(...classes: (ClassValue | ClassValue[])[]): string {
  return classes
    .flat()
    .map((c) => (typeof c === "string" ? c : c ? String(c) : ""))
    .filter((c): c is string => c.length > 0)
    .join(" ");
}
