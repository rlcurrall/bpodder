import { z } from "zod/v4";

import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { options, methodNotAllowed, badRequest, forbidden, serverError, ok } from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

const validScopes = ["account", "device", "podcast", "episode"] as const;
type Scope = (typeof validScopes)[number];

export default createRouteHandlerMap((ctx) => ({
  "/api/2/settings/:username/:scope": {
    OPTIONS: options(["GET", "POST", "OPTIONS"]),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const { value: scopeRaw } = parseParam(req.params.scope);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username === "current") {
          // Continue with current user
        } else if (username !== user.name) {
          return forbidden("Access denied");
        }

        if (!isValidScope(scopeRaw)) {
          return badRequest(`Invalid scope: must be one of ${validScopes.join(", ")}`);
        }
        const scope = scopeRaw;

        const query = new URL(req.url).searchParams;
        const { scopeId, error: scopeError } = buildScopeId(scope, query);
        if (scopeError) return scopeError;

        const settings = getSettings(ctx, { userId: user.id, scope, scopeId });
        return ok(settings);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Get settings handler error");
        return serverError("Server error");
      }
    },

    async POST(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const { value: scopeRaw } = parseParam(req.params.scope);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username === "current") {
          // Continue with current user
        } else if (username !== user.name) {
          return forbidden("Access denied");
        }

        if (!isValidScope(scopeRaw)) {
          return badRequest(`Invalid scope: must be one of ${validScopes.join(", ")}`);
        }
        const scope = scopeRaw;

        const query = new URL(req.url).searchParams;
        const { scopeId, error: scopeError } = buildScopeId(scope, query);
        if (scopeError) return scopeError;

        const rawBody = await req.json().catch(() => ({}));

        const body = z
          .object({
            set: z.record(z.string(), z.unknown()).optional(),
            remove: z.array(z.string()).optional(),
          })
          .safeParse(rawBody);

        if (!body.success) {
          return badRequest("Invalid request body");
        }

        const set =
          typeof body.data.set === "object" &&
          body.data.set !== null &&
          !Array.isArray(body.data.set)
            ? body.data.set
            : {};
        const remove =
          Array.isArray(body.data.remove) &&
          body.data.remove.every((r: unknown) => typeof r === "string")
            ? body.data.remove
            : [];

        ctx.db.transaction(() => {
          // Handle removals
          for (const key of remove) {
            ctx.db.run(
              "DELETE FROM settings WHERE user = ? AND scope = ? AND scope_id = ? AND key = ?",
              user.id,
              scope,
              scopeId,
              key,
            );
          }

          // Handle upserts
          for (const [key, value] of Object.entries(set)) {
            const valueJson = JSON.stringify(value);
            ctx.db.run(
              `INSERT INTO settings (user, scope, scope_id, key, value) VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(user, scope, scope_id, key) DO UPDATE SET value = excluded.value`,
              user.id,
              scope,
              scopeId,
              key,
              valueJson,
            );
          }
        });

        const settings = getSettings(ctx, { userId: user.id, scope, scopeId });
        return ok(settings);
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Post settings handler error");
        return serverError("Server error");
      }
    },
  },
}));

function isValidScope(scope: string): scope is Scope {
  return validScopes.includes(scope as Scope);
}

function buildScopeId(scope: Scope, query: URLSearchParams): { scopeId: string; error?: Response } {
  switch (scope) {
    case "account":
      return { scopeId: "" };
    case "device": {
      const device = query.get("device");
      if (!device) {
        return { scopeId: "", error: badRequest("Missing required query param: device") };
      }
      return { scopeId: device };
    }
    case "podcast": {
      const podcast = query.get("podcast");
      if (!podcast) {
        return { scopeId: "", error: badRequest("Missing required query param: podcast") };
      }
      return { scopeId: podcast };
    }
    case "episode": {
      const episode = query.get("episode");
      if (!episode) {
        return {
          scopeId: "",
          error: badRequest("Missing required query param: episode"),
        };
      }
      return { scopeId: episode };
    }
  }
}
function getSettings(
  ctx: AppContext,
  { userId, scope, scopeId }: { userId: number; scope: Scope; scopeId: string },
): Record<string, unknown> {
  const rows = ctx.db.all<{ key: string; value: string }>(
    "SELECT key, value FROM settings WHERE user = ? AND scope = ? AND scope_id = ?",
    userId,
    scope,
    scopeId,
  );

  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}
