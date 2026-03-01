export const API_BASE = "";

function handleUnauthorized() {
  localStorage.removeItem("username");
  window.location.href = "/login";
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    credentials: "include",
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  return res;
}
