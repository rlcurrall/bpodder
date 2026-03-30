export function getFirstSearchParam(
  searchParams: URLSearchParams,
  ...names: string[]
): string | undefined {
  for (const name of names) {
    const value = searchParams.get(name);
    if (value !== null) {
      return value;
    }
  }

  return undefined;
}
