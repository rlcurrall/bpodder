import { route } from "preact-router";
import { useState, useEffect } from "preact/hooks";

import type { Device, Subscription, EpisodeAction } from "../lib/api";

import { DeviceList } from "../components/device-list";
import { EpisodeList } from "../components/episode-list";
import { NavbarItem, NavbarLabel, NavbarSection } from "../components/navbar";
import { StackedLayout } from "../components/stacked-layout";
import { SubscriptionList } from "../components/subscription-list";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";

interface DashboardPageProps {
  path?: string;
  default?: boolean;
}

export function DashboardPage(_props: DashboardPageProps) {
  const { username, logout } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!username) return;

    async function loadData() {
      try {
        const [devs, subs, eps] = await Promise.all([
          api.getDevices(username!),
          api.getSubscriptions(username!),
          api.getEpisodeActions(username!),
        ]);
        setDevices(devs);
        setSubscriptions(subs);
        setEpisodes(eps.slice(0, 50));
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [username]);

  const handleLogout = async () => {
    await logout();
    route("/login");
  };

  const navbar = (
    <>
      <div class="py-2.5 lg:hidden" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-4 py-2.5">
          <div class="flex items-center gap-3">
            <span class="relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5 dark:text-white">
              <span class="truncate">bpodder</span>
            </span>
          </div>
          <div class="-ml-4 flex-1" />
          <div class="flex items-center gap-3">
            <button
              onClick={handleLogout}
              class="relative flex min-w-0 items-center gap-3 rounded-lg p-2 text-left text-base/6 font-medium text-zinc-950 sm:text-sm/5 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/5"
            >
              <span class="truncate">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );

  const sidebar = (
    <div class="px-4 py-6">
      <NavbarSection class="flex-col items-start gap-4">
        <NavbarItem current href="/dashboard">
          <NavbarLabel>Dashboard</NavbarLabel>
        </NavbarItem>
        <NavbarItem onClick={handleLogout}>
          <NavbarLabel>Logout</NavbarLabel>
        </NavbarItem>
      </NavbarSection>
    </div>
  );

  if (loading) {
    return (
      <StackedLayout navbar={navbar} sidebar={sidebar}>
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </StackedLayout>
    );
  }

  return (
    <StackedLayout navbar={navbar} sidebar={sidebar}>
      {error && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      <div class="space-y-4">
        <DeviceList devices={devices} />
        <SubscriptionList subscriptions={subscriptions} />
        <EpisodeList episodes={episodes} />
      </div>
    </StackedLayout>
  );
}
