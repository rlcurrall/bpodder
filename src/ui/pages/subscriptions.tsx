import { useState } from "preact/hooks";

import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Input } from "../components/input";
import { PageLayout } from "../components/page-layout";
import { Text, TextLink } from "../components/text";
import { useSubscribe, useSubscriptions, useUnsubscribe } from "../hooks/use-subscriptions";
import { getOpmlUrl } from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";

export function SubscriptionsPage() {
  const { username } = useAuth();
  const [newUrl, setNewUrl] = useState("");

  const { data: subscriptions = [], isPending, error } = useSubscriptions();

  const subscribeMutation = useSubscribe();
  const unsubscribeMutation = useUnsubscribe();

  const handleAdd = (e: Event) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    subscribeMutation.mutate(newUrl.trim(), {
      onSuccess: () => setNewUrl(""),
    });
  };

  const handleRemove = (url: string) => {
    if (!confirm("Unsubscribe from this podcast?")) return;
    unsubscribeMutation.mutate(url);
  };

  if (isPending) {
    return (
      <PageLayout currentPath="/subscriptions" title="Subscriptions">
        <div class="text-center text-zinc-500 dark:text-zinc-400">Loading...</div>
      </PageLayout>
    );
  }

  const mutationError = subscribeMutation.error || unsubscribeMutation.error;

  return (
    <PageLayout currentPath="/subscriptions" title="Subscriptions">
      {(error || mutationError) && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          {error
            ? "Failed to load subscriptions"
            : subscribeMutation.error
              ? "Failed to subscribe"
              : "Failed to unsubscribe"}
        </div>
      )}

      <Card class="mb-6">
        <CardHeader>
          <CardTitle>Subscribe to a new podcast</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} class="flex gap-3">
            <Input
              type="url"
              placeholder="https://example.com/feed.xml"
              value={newUrl}
              onInput={(e) => setNewUrl((e.target as HTMLInputElement).value)}
              class="flex-1"
              required
            />
            <Button type="submit" disabled={subscribeMutation.isPending}>
              {subscribeMutation.isPending ? "Adding..." : "Subscribe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader class="flex justify-between items-center">
          <CardTitle>Your Subscriptions ({subscriptions.length})</CardTitle>
          <TextLink
            href={getOpmlUrl(username!)}
            class="text-sm"
            download={`${username}-subscriptions.opml`}
          >
            Download OPML
          </TextLink>
        </CardHeader>
        <CardContent>
          {subscriptions.length === 0 ? (
            <Text>No podcast subscriptions yet.</Text>
          ) : (
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-zinc-200 dark:border-zinc-700">
                    <th class="text-left py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium">
                      Podcast URL
                    </th>
                    <th class="text-right py-2 px-2 text-zinc-600 dark:text-zinc-400 font-medium w-24">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((url) => (
                    <tr
                      key={url}
                      class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                    >
                      <td class="py-2 px-2">
                        <TextLink
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="truncate block max-w-xs sm:max-w-md"
                          title={url}
                        >
                          {url.replace(/^https?:\/\//, "")}
                        </TextLink>
                      </td>
                      <td class="py-2 px-2 text-right">
                        <button
                          onClick={() => handleRemove(url)}
                          class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
                          title="Unsubscribe"
                        >
                          Remove
                        </button>
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
