import { useState } from "preact/hooks";

import type { DeviceResponseType } from "../../lib/schemas";

import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";
import { PageLayout } from "../components/page-layout";
import { Select } from "../components/select";
import { Text } from "../components/text";
import { useDevices, useUpdateDevice } from "../hooks/use-devices";

const DEVICE_TYPES = ["desktop", "laptop", "mobile", "server", "other"] as const;

export function DevicesPage() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [editType, setEditType] = useState("");

  const { data: devices = [], isPending, error } = useDevices();

  const updateMutation = useUpdateDevice();

  const startEditing = (device: DeviceResponseType) => {
    setEditingId(device.id);
    setEditCaption(device.caption || device.id);
    setEditType(device.type || "other");
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditCaption("");
    setEditType("");
  };

  const saveDevice = (deviceId: string) => {
    updateMutation.mutate(
      { deviceId, caption: editCaption, type: editType },
      { onSuccess: () => setEditingId(null) },
    );
  };

  if (isPending) {
    return (
      <PageLayout currentPath="/devices" title="Devices">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout currentPath="/devices" title="Devices">
      {(error || updateMutation.error) && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error ? "Failed to load devices" : "Failed to update device"}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Connected Devices ({devices.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <Text>
              No devices connected yet. Add a device using the GPodder sync URL in your podcast app.
            </Text>
          ) : (
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-zinc-200 dark:border-zinc-700">
                    <th class="text-left py-4 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                      Name
                    </th>
                    <th class="text-left py-4 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                      Type
                    </th>
                    <th class="text-right py-4 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                      Subscriptions
                    </th>
                    <th class="text-right py-4 px-2 text-zinc-600 dark:text-zinc-400 font-medium w-40">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((device) => (
                    <tr
                      key={device.id}
                      class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                    >
                      {editingId === device.id ? (
                        <>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center">
                              <Input
                                type="text"
                                value={editCaption}
                                onInput={(e) =>
                                  setEditCaption((e.target as HTMLInputElement).value)
                                }
                                placeholder="Device name"
                              />
                            </div>
                          </td>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center">
                              <Select
                                value={editType}
                                onChange={(e) => setEditType((e.target as HTMLSelectElement).value)}
                              >
                                {DEVICE_TYPES.map((type) => (
                                  <option key={type} value={type}>
                                    {type.charAt(0).toUpperCase() + type.slice(1)}
                                  </option>
                                ))}
                              </Select>
                            </div>
                          </td>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center justify-end text-zinc-600 dark:text-zinc-400">
                              {device.subscriptions}
                            </div>
                          </td>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center justify-end gap-2">
                              <Button
                                onClick={() => saveDevice(device.id)}
                                disabled={updateMutation.isPending}
                                color="blue"
                              >
                                {updateMutation.isPending ? "Saving..." : "Save"}
                              </Button>
                              <Button
                                onClick={cancelEditing}
                                disabled={updateMutation.isPending}
                                plain
                              >
                                Cancel
                              </Button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center text-zinc-900 dark:text-white">
                              {device.caption || device.id}
                            </div>
                          </td>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center text-zinc-600 dark:text-zinc-400 capitalize">
                              {device.type || "other"}
                            </div>
                          </td>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center justify-end text-zinc-600 dark:text-zinc-400">
                              {device.subscriptions}
                            </div>
                          </td>
                          <td class="px-2 h-16">
                            <div class="h-full flex items-center justify-end">
                              <button
                                onClick={() => startEditing(device)}
                                class="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
