import { useQuery } from "@tanstack/preact-query";

import { getUiConfig } from "../lib/api/config";

export function useUiConfig() {
  return useQuery({
    queryKey: ["uiConfig"],
    queryFn: () => getUiConfig(),
  });
}
