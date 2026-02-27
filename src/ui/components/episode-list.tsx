import type { EpisodeAction } from "../lib/api";

import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Text } from "./text";

interface EpisodeListProps {
  episodes: EpisodeAction[];
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function getActionBadgeClass(action: string): string {
  switch (action.toLowerCase()) {
    case "play":
      return "bg-emerald-600 dark:bg-emerald-500";
    case "download":
      return "bg-blue-600 dark:bg-blue-500";
    case "delete":
      return "bg-red-600 dark:bg-red-500";
    case "new":
      return "bg-yellow-600 dark:bg-yellow-500";
    default:
      return "bg-zinc-600 dark:bg-zinc-500";
  }
}

export function EpisodeList({ episodes }: EpisodeListProps) {
  if (episodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Text>No episode activity recorded yet.</Text>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity (last {episodes.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-zinc-200 dark:border-zinc-700">
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  Podcast
                </th>
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  Episode
                </th>
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  Action
                </th>
                <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {episodes.map((ep, i) => (
                <tr key={i} class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0">
                  <td
                    class="py-2 px-2 text-zinc-700 dark:text-zinc-300 truncate max-w-xs"
                    title={ep.podcast}
                  >
                    {ep.podcast.replace(/^https?:\/\//, "").slice(0, 40)}
                  </td>
                  <td
                    class="py-2 px-2 text-zinc-700 dark:text-zinc-300 truncate max-w-xs"
                    title={ep.episode}
                  >
                    {ep.episode.slice(0, 40)}
                  </td>
                  <td class="py-2 px-2">
                    <span
                      class={`inline-block px-2 py-1 rounded-full text-xs font-medium text-white uppercase ${getActionBadgeClass(
                        ep.action,
                      )}`}
                    >
                      {ep.action}
                    </span>
                  </td>
                  <td class="py-2 px-2 text-zinc-700 dark:text-zinc-300">
                    {formatTimestamp(ep.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
