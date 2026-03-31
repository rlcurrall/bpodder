import { requireAuth } from "@server/lib/auth";
import { getBody } from "@server/lib/body";
import { stripExtension } from "@server/lib/params";
import { options, methodNotAllowed, badRequest, forbidden, ok } from "@server/lib/response";
import { createRouteHandlerMap } from "@server/lib/routing";
import {
  SettingsUpdateRequest,
  SettingsResponse,
  validScopes,
  type Scope,
} from "@shared/schemas/index";

export default createRouteHandlerMap((ctx) => ({
  "/api/2/settings/:username/:scope": {
    OPTIONS: options(["GET", "POST", "OPTIONS"]),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      const { value: username } = stripExtension(req.params.username, ["json"]);
      const { value: scopeRaw } = stripExtension(req.params.scope, ["json"]);
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
      return ok(SettingsResponse.parse(settings));
    },

    async POST(req) {
      const { value: username } = stripExtension(req.params.username, ["json"]);
      const { value: scopeRaw } = stripExtension(req.params.scope, ["json"]);
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

      const body = await getBody(req, SettingsUpdateRequest);

      const set = body.set ?? {};
      const remove = body.remove ?? [];

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
      return ok(SettingsResponse.parse(settings));
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
    default:
      // TypeScript should never reach here due to type narrowing, but we handle it defensively
      return { scopeId: "", error: badRequest("Invalid scope") };
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
