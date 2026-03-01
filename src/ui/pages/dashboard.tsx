import { Card, CardContent } from "../components/card";
import { PageLayout } from "../components/page-layout";
import { Text, TextLink } from "../components/text";
import { useDashboard } from "../hooks/use-dashboard";

export function DashboardPage() {
  const { data, isPending, error } = useDashboard();

  if (isPending) {
    return (
      <PageLayout currentPath="/dashboard" title="Dashboard">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  const devices = data?.devices ?? [];
  const subscriptions = data?.subscriptions ?? [];
  const episodes = data?.episodes ?? [];

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
            <div class="text-3xl font-bold text-zinc-900 dark:text-white">
              {subscriptions.length}
            </div>
            <Text class="text-sm mt-1">Subscriptions</Text>
            <TextLink href="/subscriptions" class="text-sm mt-2 inline-block">
              Manage →
            </TextLink>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="py-6">
            <div class="text-3xl font-bold text-zinc-900 dark:text-white">{devices.length}</div>
            <Text class="text-sm mt-1">Devices</Text>
            <TextLink href="/devices" class="text-sm mt-2 inline-block">
              View →
            </TextLink>
          </CardContent>
        </Card>

        <Card>
          <CardContent class="py-6">
            <div class="text-3xl font-bold text-zinc-900 dark:text-white">{episodes.length}</div>
            <Text class="text-sm mt-1">Recent Activity</Text>
            <TextLink href="/activity" class="text-sm mt-2 inline-block">
              View all →
            </TextLink>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
