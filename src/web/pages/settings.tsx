import { useMutation } from "@tanstack/preact-query";
import { useState } from "preact/hooks";

import type { SettingsResponseType } from "../../shared/schemas";

import { Button } from "../components/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/card";
import { ErrorMessage, Field, Label } from "../components/fieldset";
import { Input } from "../components/input";
import { PageLayout } from "../components/page-layout";
import { useSettings } from "../hooks/use-settings";
import { changePassword, deleteAccount } from "../lib/api/auth";
import { useAuth } from "../lib/auth";

export function SettingsPage() {
  const { username, logout } = useAuth();
  const [copied, setCopied] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMatchError, setPasswordMatchError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMatchError(null);
    },
  });

  const handleChangePassword = (e: Event) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMatchError("Passwords do not match");
      return;
    }
    setPasswordMatchError(null);
    changePasswordMutation.mutate();
  };

  const [deletePassword, setDeletePassword] = useState("");

  const deleteAccountMutation = useMutation({
    mutationFn: () => deleteAccount(deletePassword),
    onSuccess: () => logout(),
  });

  const syncUrl = typeof window !== "undefined" ? window.location.origin : "";

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

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} class="space-y-4">
              <Field>
                <Label for="current-password">Current password</Label>
                <Input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onInput={(e) => setCurrentPassword((e.target as HTMLInputElement).value)}
                  required
                />
              </Field>
              <Field>
                <Label for="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onInput={(e) => setNewPassword((e.target as HTMLInputElement).value)}
                  required
                />
              </Field>
              <Field>
                <Label for="confirm-password">Confirm new password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onInput={(e) => setConfirmPassword((e.target as HTMLInputElement).value)}
                  required
                />
              </Field>
              {passwordMatchError && <ErrorMessage>{passwordMatchError}</ErrorMessage>}
              {changePasswordMutation.error && (
                <ErrorMessage>{changePasswordMutation.error.message}</ErrorMessage>
              )}
              {changePasswordMutation.isSuccess && (
                <p class="text-sm text-emerald-600 dark:text-emerald-400">Password changed.</p>
              )}
              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? "Saving…" : "Change password"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Delete Account */}
        <Card>
          <CardHeader>
            <CardTitle>Delete Account</CardTitle>
          </CardHeader>
          <CardContent>
            <p class="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              This will permanently delete your account and all data.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                deleteAccountMutation.mutate();
              }}
              class="space-y-4"
            >
              <Field>
                <Label for="delete-password">Confirm your password</Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onInput={(e) => setDeletePassword((e.target as HTMLInputElement).value)}
                  required
                />
              </Field>
              {deleteAccountMutation.error && (
                <ErrorMessage>{deleteAccountMutation.error.message}</ErrorMessage>
              )}
              <Button color="red" type="submit" disabled={deleteAccountMutation.isPending}>
                {deleteAccountMutation.isPending ? "Deleting…" : "Delete account"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
