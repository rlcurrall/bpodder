import { useState } from "preact/hooks";

import type { SettingsResponseType } from "../../shared/schemas";

import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";
import { PageLayout } from "../components/page-layout";
import { TextLink } from "../components/text";
import { useSettings } from "../hooks/use-settings";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { username } = useAuth();
  const [copied, setCopied] = useState(false);

  const syncUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/${encodeURIComponent(username || "")}`
      : "";

  const { data: settings = {} as SettingsResponseType, isPending } = useSettings();

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(syncUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById("sync-url") as HTMLInputElement;
      if (input) {
        input.select();
      }
    }
  };

  if (isPending) {
    return (
      <PageLayout currentPath="/settings" title="Settings">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout currentPath="/settings" title="Settings">
      <div class="space-y-6">
        {/* Account Info */}
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-2">
              <div class="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-700">
                <span class="text-zinc-600 dark:text-zinc-400">Username</span>
                <span class="font-medium text-zinc-900 dark:text-white">{username}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sync URL */}
        <Card>
          <CardHeader>
            <CardTitle>Sync URL</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
              Use this URL in your podcast app to sync subscriptions and episode progress.
            </p>
            <div class="flex gap-2">
              <Input
                id="sync-url"
                type="text"
                value={syncUrl}
                readOnly
                class="flex-1"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button onClick={handleCopyUrl} type="button">
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* App Settings */}
        {Object.keys(settings).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>App Settings</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="space-y-2">
                {Object.entries(settings).map(([key, value]) => (
                  <div
                    key={key}
                    class="flex justify-between items-center py-2 border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                  >
                    <span class="text-zinc-600 dark:text-zinc-400 capitalize">
                      {key.replace(/_/g, " ")}
                    </span>
                    <span class="text-zinc-900 dark:text-white">
                      {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help */}
        <Card>
          <CardHeader>
            <CardTitle>Help</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                <TextLink
                  href="https://gpodder.github.io/docs/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  GPodder Documentation
                </TextLink>
              </p>
              <p>
                <TextLink
                  href="https://gpodder.github.io/docs/client-software.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Supported Podcast Apps
                </TextLink>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
