import { useLocation } from "preact-iso";
import { useState } from "preact/hooks";

import { RegisterRequest } from "../../lib/schemas";
import { Button } from "../components/button";
import { Field, Label, ErrorMessage } from "../components/fieldset";
import { Heading } from "../components/heading";
import { Input } from "../components/input";
import { Text, TextLink } from "../components/text";
import * as api from "../lib/api";

export function RegisterPage() {
  const { route } = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setError("");

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const user = formData.get("username") as string;
    const pass = formData.get("password") as string;
    const passConfirm = formData.get("password-confirm") as string;

    const parseResult = RegisterRequest.safeParse({
      username: user,
      password: pass,
      passwordConfirm: passConfirm,
    });

    if (!parseResult.success) {
      const firstError = parseResult.error.issues[0];
      setError(firstError.message);
      return;
    }

    const result = await api.register(user, pass, passConfirm);
    if (result.success) {
      setSuccess(true);
      setTimeout(() => {
        route("/login");
      }, 1500);
    } else {
      setError(result.error || "Registration failed");
    }
  };

  if (success) {
    return (
      <div class="min-h-screen bg-white dark:bg-zinc-900 flex items-center justify-center p-4">
        <div class="w-full max-w-md bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-8 text-center shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/5">
          <Heading level={1} class="mb-2">
            Registration Successful
          </Heading>
          <p class="text-zinc-500 dark:text-zinc-400">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div class="min-h-screen bg-white dark:bg-zinc-900 flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-zinc-50 dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-8 shadow-sm ring-1 ring-zinc-950/5 dark:ring-white/5">
        <Heading level={1} class="text-center mb-6">
          Register
        </Heading>
        <form onSubmit={handleSubmit} class="space-y-4">
          <Field>
            <Label for="username">Username</Label>
            <Input
              type="text"
              id="username"
              name="username"
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
              name="password"
              value={password}
              onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              required
            />
          </Field>
          <Field>
            <Label for="password-confirm">Confirm Password</Label>
            <Input
              type="password"
              id="password-confirm"
              name="password-confirm"
              value={passwordConfirm}
              onInput={(e) => setPasswordConfirm((e.target as HTMLInputElement).value)}
              required
            />
          </Field>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <Button type="submit" color="green" class="w-full">
            Register
          </Button>
        </form>
        <Text class="text-center mt-4">
          Already have an account? <TextLink href="/login">Login</TextLink>
        </Text>
      </div>
    </div>
  );
}
