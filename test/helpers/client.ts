export class Client {
  private base: string;
  private headers: Record<string, string>;

  constructor(base: string, headers: Record<string, string> = {}) {
    this.base = base;
    this.headers = headers;
  }

  withBasicAuth(username: string, password: string): Client {
    const auth = btoa(`${username}:${password}`);
    return new Client(this.base, {
      ...this.headers,
      Authorization: `Basic ${auth}`,
    });
  }

  withCookie(cookie: string): Client {
    return new Client(this.base, {
      ...this.headers,
      Cookie: cookie,
    });
  }

  withTokenAuth(username: string, token: string): Client {
    // Token auth format: username__token with any password
    const auth = btoa(`${username}__${token}:ignored_password`);
    return new Client(this.base, {
      ...this.headers,
      Authorization: `Basic ${auth}`,
    });
  }

  async get(path: string, params?: Record<string, string>): Promise<Response> {
    const url = new URL(path, this.base);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    return fetch(url.toString(), {
      method: "GET",
      headers: this.headers,
    });
  }

  async post(path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { ...this.headers };
    let requestBody: BodyInit | undefined;

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      requestBody = JSON.stringify(body);
    }

    return fetch(new URL(path, this.base).toString(), {
      method: "POST",
      headers,
      body: requestBody,
    });
  }

  async postForm(path: string, body: Record<string, string>): Promise<Response> {
    const headers: Record<string, string> = { ...this.headers };
    const formData = new URLSearchParams();
    Object.entries(body).forEach(([key, value]) => {
      formData.append(key, value);
    });

    headers["Content-Type"] = "application/x-www-form-urlencoded";

    return fetch(new URL(path, this.base).toString(), {
      method: "POST",
      headers,
      body: formData.toString(),
    });
  }

  async put(
    path: string,
    body?: unknown,
    options?: { headers?: Record<string, string> },
  ): Promise<Response> {
    const headers: Record<string, string> = { ...this.headers, ...options?.headers };
    let requestBody: BodyInit | undefined;

    if (body !== undefined) {
      if (typeof body === "string") {
        // Plain text (for .txt endpoints) - unless Content-Type specified in options
        if (!headers["Content-Type"]) {
          headers["Content-Type"] = "text/plain";
        }
        requestBody = body;
      } else {
        headers["Content-Type"] = "application/json";
        requestBody = JSON.stringify(body);
      }
    }

    return fetch(new URL(path, this.base).toString(), {
      method: "PUT",
      headers,
      body: requestBody,
    });
  }

  async json<T>(res: Response): Promise<T> {
    const contentType = res.headers.get("Content-Type");
    if (!contentType?.includes("application/json")) {
      throw new Error(`Expected JSON, got ${contentType}. Body: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  async text(res: Response): Promise<string> {
    return res.text();
  }
}

export function cookie(res: Response, name: string): string | null {
  const setCookie = res.headers.get("Set-Cookie");
  if (!setCookie) return null;

  const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}
