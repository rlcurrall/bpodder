import { useMutation, useQuery, useQueryClient } from "@tanstack/preact-query";

import { getDevices, updateDevice } from "../lib/api/devices";
import { useAuth } from "../lib/auth";

export function useDevices() {
  const { username } = useAuth();

  return useQuery({
    queryKey: ["devices", username],
    queryFn: () => getDevices(username!),
    enabled: !!username,
  });
}

export function useUpdateDevice() {
  const { username } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      deviceId,
      caption,
      type,
    }: {
      deviceId: string;
      caption: string;
      type: string;
    }) => updateDevice(username!, deviceId, { caption, type }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["devices", username] });
    },
  });
}
