import { useLocation } from "preact-iso";
import { useState, useEffect } from "preact/hooks";

import { Button } from "../components/button";
import { Field, Label, ErrorMessage } from "../components/fieldset";
import { Heading } from "../components/heading";
import { Input } from "../components/input";
import { Text, TextLink } from "../components/text";
import * as api from "../lib/api";
import { useAuth } from "../lib/auth";

export function LoginPage() {
  const { route } = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showRegister, setShowRegister] = useState(false);
  const { login } = useAuth();

  useEffect(() => {
    api.getUiConfig().then((config) => {
      setShowRegister(config.enableRegistration);
    });
  }, []);

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError("");

    const ok = await login(username, password);
    if (ok) {
      route("/dashboard");
    } else {
      setError("Invalid username or password");
    }
  };

  return (
    <div class="min-h-screen bg-white dark:bg-zinc-900 flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-8 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/5">
        <Heading level={1} class="text-center mb-6">
          bpodder
        </Heading>
        <form onSubmit={handleSubmit} class="space-y-4">
          <Field>
            <Label for="username">Username</Label>
            <Input
              type="text"
              id="username"
              value={username}
              onInput={(e) => setUsername((e.target as HTMLInputElement).value)}
              required
            />
          </Field>
          <Field>
            <Label for="password">Password</Label>
            <Input
              type="password"
              id="password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              required
            />
          </Field>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button type="submit" color="green" class="w-full">
            Login
          </Button>
        </form>
        {showRegister && (
          <Text class="text-center mt-4">
            Don't have an account? <TextLink href="/register">Register</TextLink>
          </Text>
        )}
      </div>
    </div>
  );
}
