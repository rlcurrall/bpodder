import { useEffect, useState } from "preact/hooks";

import type { SubscriptionItem } from "../hooks/use-subscriptions";

import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "../components/dialog";
import { Input } from "../components/input";
import { PageLayout } from "../components/page-layout";
import { Select } from "../components/select";
import { Text, TextLink } from "../components/text";
import { useDevices } from "../hooks/use-devices";
import { useSubscribe, useSubscriptions, useUnsubscribe } from "../hooks/use-subscriptions";
import { getOpmlUrl } from "../lib/api/subscriptions";
import { useAuth } from "../lib/auth";

function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, "");
  }
}

export function SubscriptionsPage() {
  const { username } = useAuth();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [urlToRemove, setUrlToRemove] = useState<string | null>(null);

  // Add dialog state
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addUrl, setAddUrl] = useState("");
  const [addDeviceId, setAddDeviceId] = useState<string>("");

  const { data: devices = [] } = useDevices();
  const {
    data: subscriptions = [],
    isPending,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    totalCount,
  } = useSubscriptions(selectedDeviceId, searchQuery ? { q: searchQuery } : undefined);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const subscribeMutation = useSubscribe();
  const unsubscribeMutation = useUnsubscribe();

  const selectedDevice = devices.find((d) => d.id === selectedDeviceId);
  const itemToRemove = subscriptions.find((s: SubscriptionItem) => s.url === urlToRemove);
  const opmlHref = getOpmlUrl(username!, selectedDeviceId ?? undefined);

  // Prefill add dialog device when opening
  const openAddDialog = () => {
    setAddDeviceId(selectedDeviceId ?? "");
    setAddUrl("");
    setIsAddDialogOpen(true);
  };

  const handleAddSubmit = (e: Event) => {
    e.preventDefault();
    if (!addUrl.trim() || !addDeviceId) return;
    subscribeMutation.mutate(
      { url: addUrl.trim(), deviceId: addDeviceId },
      {
        onSuccess: () => {
          setAddUrl("");
          setIsAddDialogOpen(false);
        },
      },
    );
  };

  const handleConfirmRemove = () => {
    if (!urlToRemove || !selectedDeviceId) return;
    unsubscribeMutation.mutate(
      { url: urlToRemove, deviceId: selectedDeviceId },
      { onSuccess: () => setUrlToRemove(null) },
    );
  };

  // Format the count display
  const formatCount = () => {
    if (totalCount !== null) {
      return `${subscriptions.length} of ${totalCount}`;
    }
    return String(subscriptions.length);
  };

  const mutationError = subscribeMutation.error || unsubscribeMutation.error;

  return (
    <PageLayout currentPath="/subscriptions" title="Subscriptions">
      {mutationError && (
        <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-500 text-red-600 dark:text-red-400 px-4 py-3 rounded mb-4">
          {subscribeMutation.error ? "Failed to subscribe" : "Failed to unsubscribe"}
        </div>
      )}

      <Card>
        <CardHeader class="flex flex-col gap-4">
          {/* Title row */}
          <div class="flex justify-between items-center flex-wrap gap-2">
            <CardTitle>
              {selectedDevice
                ? `${selectedDevice.caption || selectedDevice.id} (${formatCount()})`
                : `All Subscriptions (${formatCount()})`}
            </CardTitle>
            <div class="flex items-center gap-2">
              <Button color="blue" onClick={openAddDialog}>
                Add
              </Button>
              <Button href={opmlHref} download outline>
                Export
              </Button>
            </div>
          </div>

          {/* Filter toolbar */}
          <div class="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-3">
            <div class="w-full">
              <Select
                value={selectedDeviceId ?? ""}
                onChange={(e) => {
                  const val = (e.target as HTMLSelectElement).value;
                  setSelectedDeviceId(val || null);
                }}
                aria-label="Device"
              >
                <option value="">All devices</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.caption || d.id}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              type="search"
              placeholder="Search subscriptions..."
              value={searchInput}
              onInput={(e) => setSearchInput((e.target as HTMLInputElement).value)}
            />
          </div>
        </CardHeader>

        <CardContent>
          {error ? (
            <div class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/50 dark:bg-red-900/20 dark:text-red-300">
              {error.message || "Failed to load subscriptions"}
            </div>
          ) : isPending && subscriptions.length === 0 ? (
            <Text>Loading...</Text>
          ) : subscriptions.length === 0 ? (
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
                  {subscriptions.map((sub: SubscriptionItem) => (
                    <tr
                      key={sub.url}
                      class="border-b border-zinc-200 dark:border-zinc-700 last:border-b-0"
                    >
                      <td class="py-2 px-2">
                        <div class="flex items-center gap-2">
                          {sub.image_url && (
                            <img
                              src={sub.image_url}
                              alt=""
                              width={24}
                              height={24}
                              loading="lazy"
                              class="rounded shrink-0 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                          <div class="min-w-0">
                            <TextLink
                              href={sub.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              class="block font-medium truncate max-w-xs sm:max-w-md"
                              title={sub.url}
                            >
                              {sub.title ?? extractHostname(sub.url)}
                            </TextLink>
                            {sub.title && (
                              <span class="text-xs text-zinc-500 dark:text-zinc-400 truncate block max-w-xs sm:max-w-md">
                                {sub.url.replace(/^https?:\/\//, "")}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td class="py-2 px-2 text-right">
                        <button
                          onClick={() => setUrlToRemove(sub.url)}
                          disabled={!selectedDeviceId}
                          class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            selectedDeviceId ? "Unsubscribe" : "Select a device to unsubscribe"
                          }
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Load more button */}
              {hasNextPage && (
                <div class="mt-4 text-center">
                  <Button onClick={() => fetchNextPage()} disabled={isFetchingNextPage} outline>
                    {isFetchingNextPage ? "Loading..." : "Load more"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onClose={() => setIsAddDialogOpen(false)}>
        <DialogBackdrop />
        <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <DialogPanel class="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg sm:p-6 dark:bg-zinc-800 dark:outline dark:-outline-offset-1 dark:outline-white/10">
              <DialogTitle class="text-base font-semibold text-zinc-900 dark:text-white mb-4">
                Add Podcast Subscription
              </DialogTitle>
              <form onSubmit={handleAddSubmit} class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Feed URL
                  </label>
                  <Input
                    type="url"
                    placeholder="https://example.com/feed.xml"
                    value={addUrl}
                    onInput={(e) => setAddUrl((e.target as HTMLInputElement).value)}
                    data-autofocus
                    required
                    class="w-full"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                    Device
                  </label>
                  <Select
                    value={addDeviceId}
                    onChange={(e) => {
                      setAddDeviceId((e.target as HTMLSelectElement).value);
                    }}
                    class="w-full"
                    required
                  >
                    <option value="">Select a device</option>
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.caption || d.id}
                      </option>
                    ))}
                  </Select>
                </div>
                <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                  <Button
                    color="blue"
                    type="submit"
                    disabled={!addUrl.trim() || !addDeviceId || subscribeMutation.isPending}
                  >
                    {subscribeMutation.isPending ? "Adding..." : "Add"}
                  </Button>
                  <Button outline onClick={() => setIsAddDialogOpen(false)} type="button">
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogPanel>
          </div>
        </div>
      </Dialog>

      {/* Unsubscribe Confirmation Dialog */}
      <Dialog open={urlToRemove !== null} onClose={() => setUrlToRemove(null)}>
        <DialogBackdrop />
        <div class="fixed inset-0 z-10 w-screen overflow-y-auto">
          <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
            <DialogPanel class="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl sm:my-8 sm:w-full sm:max-w-lg sm:p-6 dark:bg-zinc-800 dark:outline dark:-outline-offset-1 dark:outline-white/10">
              <div class="sm:flex sm:items-start">
                <div class="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10 sm:mx-0 sm:size-10">
                  <svg
                    class="size-6 text-red-600 dark:text-red-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                    />
                  </svg>
                </div>
                <div class="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                  <DialogTitle class="text-base font-semibold text-zinc-900 dark:text-white">
                    Unsubscribe from podcast
                  </DialogTitle>
                  <div class="mt-2">
                    <p class="text-sm text-zinc-500 dark:text-zinc-400">
                      Remove{" "}
                      <span class="font-medium text-zinc-700 dark:text-zinc-300 break-all">
                        {itemToRemove?.title ?? urlToRemove?.replace(/^https?:\/\//, "")}
                      </span>{" "}
                      from{" "}
                      <span class="font-medium text-zinc-700 dark:text-zinc-300">
                        {selectedDevice?.caption || selectedDevice?.id}
                      </span>
                      ?
                    </p>
                  </div>
                </div>
              </div>
              <div class="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse gap-3">
                <Button
                  color="red"
                  onClick={handleConfirmRemove}
                  disabled={unsubscribeMutation.isPending}
                >
                  {unsubscribeMutation.isPending ? "Removing..." : "Unsubscribe"}
                </Button>
                <Button outline autofocus onClick={() => setUrlToRemove(null)}>
                  Cancel
                </Button>
              </div>
            </DialogPanel>
          </div>
        </div>
      </Dialog>
    </PageLayout>
  );
}
