import { route } from "preact-router";
import { useState, useEffect } from "preact/hooks";

import type { EpisodeActionResponseType } from "../../lib/schemas";

import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { PageLayout } from "../components/page-layout";
import { Text } from "../components/text";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "-";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
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

export function ActivityPage() {
  const { username } = useAuth();
  const [episodes, setEpisodes] = useState<EpisodeActionResponseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) {
      route("/login");
      return;
    }

    loadActivity();
  }, [username]);

  async function loadActivity() {
    try {
      const eps = await api.getEpisodeActions(username!);
      setEpisodes(eps);
    } catch {
      setError("Failed to load activity");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <PageLayout currentPath="/activity" title="Activity">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout currentPath="/activity" title="Activity">
      {error && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Episode Actions ({episodes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {episodes.length === 0 ? (
            <Text>No episode activity recorded yet.</Text>
          ) : (
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
                    <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium hidden sm:table-cell">
                      Device
                    </th>
                    <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium hidden md:table-cell">
                      Position
                    </th>
                    <th class="text-right py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                      When
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {episodes.map((ep, i) => (
                    <tr
                      key={i}
                      class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                    >
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
                        {ep.episode.split("/").pop()?.slice(0, 40) || ep.episode.slice(0, 40)}
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
                      <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400 hidden sm:table-cell">
                        {ep.device || "-"}
                      </td>
                      <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400 hidden md:table-cell">
                        {formatDuration(ep.position)}
                      </td>
                      <td class="py-2 px-2 text-zinc-600 dark:text-zinc-400 text-right text-xs">
                        {formatTimestamp(ep.timestamp)}
                      </td>
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
