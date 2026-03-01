import { route } from "preact-router";
import { useState, useEffect } from "preact/hooks";

import type { Device, EpisodeAction } from "../lib/api";

import { Card, CardContent } from "../components/card";
import { PageLayout } from "../components/page-layout";
import { Text, TextLink } from "../components/text";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";

export function DashboardPage() {
  const { username } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [subscriptions, setSubscriptions] = useState<string[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) {
      route("/login");
      return;
    }

    async function loadData() {
      try {
        const [devs, subs, eps] = await Promise.all([
          api.getDevices(username!),
          api.getSubscriptions(username!),
          api.getEpisodeActions(username!),
        ]);
        setDevices(devs);
        setSubscriptions(subs);
        setEpisodes(eps.slice(0, 10));
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username]);

  if (loading) {
    return (
      <PageLayout currentPath="/dashboard" title="Dashboard">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout currentPath="/dashboard" title="Dashboard">
      {error && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error}
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
