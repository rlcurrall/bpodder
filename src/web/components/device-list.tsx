import type { Device } from "../lib/api/devices";

import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Text } from "./text";

interface DeviceListProps {
  devices: Device[];
}

export function DeviceList({ devices }: DeviceListProps) {
  if (devices.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Devices</CardTitle>
        </CardHeader>
        <CardContent>
          <Text>No devices connected yet.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Devices ({devices.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-200 dark:border-zinc-700">
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  Name
                </th>
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  Type
                </th>
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  Subscriptions
                </th>
              </tr>
            </thead>
            <tbody>
              {devices.map((device) => (
                <tr
                  key={device.id}
                  class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                >
                  <td class="py-2 px-2 text-zinc-900 dark:text-white">
                    {device.caption || device.id}
                  </td>
                  <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400">{device.type}</td>
                  <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400">{device.subscriptions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
