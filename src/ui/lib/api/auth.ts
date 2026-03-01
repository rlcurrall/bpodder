import { ErrorResponse, LoginRequest, RegisterRequest } from "../../../lib/schemas/index";
import { API_BASE, apiFetch } from "./fetch";

export async function login(username: string, password: string): Promise<boolean> {
  const body = LoginRequest.parse({ username, password });
  const res = await fetch(`${API_BASE}/api/b-ext/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  return res.ok;
}

export async function logout(username: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/2/auth/${encodeURIComponent(username)}/logout.json`, {
    method: "POST",
  });
  localStorage.removeItem("username");
}

export interface RegisterResult {
  success: boolean;
  error?: string;
}

export async function register(
  username: string,
  password: string,
  passwordConfirm?: string,
): Promise<RegisterResult> {
  const body = RegisterRequest.parse({ username, password, passwordConfirm });
  const res = await fetch(`${API_BASE}/api/b-ext/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  });

  if (res.ok) {
    return { success: true };
  }

  // Try to get error message from response body
  try {
    const body = ErrorResponse.parse(await res.json());
    return {
      success: false,
      error: body.message || "Registration failed",
    };
  } catch {
    // Response body isn't JSON or doesn't have message field
    console.error("Registration failed with status", res.status, res);
  }

  return { success: false, error: "Registration failed" };
}
