import { Card, CardContent } from "../components/card";
import { PageLayout } from "../components/page-layout";
import { Text, TextLink } from "../components/text";
import { useDashboard } from "../hooks/use-dashboard";

function formatTimestamp(ts: string): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getActionLabel(action: string): string {
  switch (action.toLowerCase()) {
    case "play":
      return "Played";
    case "download":
      return "Downloaded";
    case "delete":
      return "Deleted";
    case "new":
      return "New";
    default:
      return action;
  }
}

export function DashboardPage() {
  const { data, isPending, error } = useDashboard();

  if (isPending) {
    return (
      <PageLayout currentPath="/dashboard" title="Dashboard">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  const deviceCount = data?.device_count ?? 0;
  const subscriptionCount = data?.subscription_count ?? 0;
  const recentEpisodes = data?.recent_episodes ?? [];

  return (
    <PageLayout currentPath="/dashboard" title="Dashboard">
      {error && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          Failed to load data
        </div>
      )}

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent class="py-6">
            <div class="text-3xl font-bold text-zinc-900 dark:text-white">{subscriptionCount}</div>
            <Text class="text-sm mt-1">Subscriptions</Text>
            <TextLink href="/subscriptions" class="text-sm mt-2 inline-block">
              Manage →
            </TextLink>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="py-6">
            <div class="text-3xl font-bold text-zinc-900 dark:text-white">{deviceCount}</div>
            <Text class="text-sm mt-1">Devices</Text>
            <TextLink href="/devices" class="text-sm mt-2 inline-block">
              View →
            </TextLink>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="py-6">
            <Text class="text-sm font-medium text-zinc-900 dark:text-white">Recent Activity</Text>
            <TextLink href="/activity" class="text-sm mt-2 inline-block">
              View all →
            </TextLink>
          </CardContent>
        </Card>
      </div>

      {/* Recent activity list */}
      {recentEpisodes.length > 0 && (
        <Card class="mb-6">
          <CardContent class="py-4">
            <div class="space-y-3">
              {recentEpisodes.slice(0, 5).map((ep) => (
                <div
                  key={ep.id}
                  class="flex items-center justify-between py-2 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <span
                      class={`inline-block px-2 py-0.5 rounded text-xs font-medium text-white uppercase ${
                        ep.action === "play"
                          ? "bg-emerald-600"
                          : ep.action === "download"
                            ? "bg-blue-600"
                            : ep.action === "delete"
                              ? "bg-red-600"
                              : "bg-zinc-600"
                      }`}
                    >
                      {getActionLabel(ep.action)}
                    </span>
                    <div class="min-w-0">
                      <div class="text-sm font-medium text-zinc-900 dark:text-white truncate max-w-xs sm:max-w-md">
                        {ep.episode.split("/").pop() || ep.episode}
                      </div>
                      <div class="text-xs text-zinc-500 dark:text-zinc-400 truncate max-w-xs sm:max-w-md">
                        {ep.podcast.replace(/^https?:\/\//, "").slice(0, 50)}
                      </div>
                    </div>
                  </div>
                  <div class="text-xs text-zinc-500 dark:text-zinc-400 shrink-0 ml-4">
                    {formatTimestamp(ep.timestamp)}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
