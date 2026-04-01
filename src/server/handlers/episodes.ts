import type { EpisodeActionInput } from "@services/episodes/types";

import { requireAuth } from "@server/lib/auth";
import { getBody } from "@server/lib/body";
import { decodeCursor } from "@server/lib/pagination";
import { stripExtension } from "@server/lib/params";
import { badRequest, options, methodNotAllowed, notFound, ok } from "@server/lib/response";
import { createRouteHandlerMap } from "@server/lib/routing";
import { normalizeTimestamp } from "@server/lib/timestamp";
import {
  toEpisodeActionPageResponse,
  toEpisodeActionResponse,
  toEpisodeUploadResponse,
} from "@server/presenters/episodes";
import { toSummaryResponse } from "@server/presenters/summary";
import {
  listEpisodeActionsPaginated,
  listEpisodeActionsSince,
  recordEpisodeActions,
} from "@services/episodes";
import { getUserSummary } from "@services/summary";
import {
  EpisodeListResponse,
  EpisodeUploadRequest,
  PaginatedQuerySchema,
  PaginatedResponseSchema,
  EpisodeActionWithId,
} from "@shared/schemas/index";

export default createRouteHandlerMap((ctx) => ({
  "/api/2/episodes/:username": {
    OPTIONS: options(["GET", "POST", "OPTIONS"]),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async GET(req) {
      const rawUsername = req.params.username;
      const { value: username } = stripExtension(rawUsername, ["json"]);

      if (!username) {
        return notFound("Invalid route");
      }

      const user = await requireAuth(req, ctx.db, ctx.sessions, username);

      const url = new URL(req.url);
      let since = parseInt(url.searchParams.get("since") ?? "0", 10);
      if (isNaN(since)) since = 0;

      const podcastFilter = url.searchParams.get("podcast") ?? undefined;
      const deviceFilter = url.searchParams.get("device") ?? undefined;
      const aggregated = url.searchParams.get("aggregated") === "true";

      const actions = listEpisodeActionsSince(ctx.db, {
        userId: user.id,
        since,
        podcast: podcastFilter,
        device: deviceFilter,
        aggregated,
      });

      const timestamp = Math.floor(Date.now() / 1000);

      const response = EpisodeListResponse.parse({
        timestamp,
        actions: actions.map(toEpisodeActionResponse),
      });
      return ok(response);
    },

    async POST(req) {
      const rawUsername = req.params.username;
      const { value: username } = stripExtension(rawUsername, ["json"]);

      if (!username) {
        return notFound("Invalid route");
      }

      const user = await requireAuth(req, ctx.db, ctx.sessions, username);

      const body = await getBody(req, EpisodeUploadRequest);

      const actions = Array.isArray(body) ? body : body.actions;

      const timestamp = Math.floor(Date.now() / 1000);

      const result = recordEpisodeActions(ctx.db, {
        userId: user.id,
        receivedAtUnix: timestamp,
        actions: actions.map(toEpisodeActionInput),
      });

      const response = toEpisodeUploadResponse(timestamp, result.rewrites);
      return ok(response);
    },
  },

  // b-ext: paginated episode actions for web UI
  "/api/b-ext/episodes/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),

    async GET(req) {
      const { value: username } = stripExtension(req.params.username, ["json"]);
      const user = await requireAuth(req, ctx.db, ctx.sessions, username);

      const url = new URL(req.url);
      const queryResult = PaginatedQuerySchema.safeParse({
        limit: url.searchParams.get("limit") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
      });

      if (!queryResult.success) {
        return badRequest(queryResult.error);
      }

      const { limit, cursor: cursorParam } = queryResult.data;

      const cursor = cursorParam ? decodeCursor(cursorParam) : null;

      // Optional filters
      const podcast = url.searchParams.get("podcast") ?? undefined;
      const device = url.searchParams.get("device") ?? undefined;
      const action = url.searchParams.get("action") ?? undefined;

      const result = await listEpisodeActionsPaginated(ctx.db, {
        userId: user.id,
        limit,
        cursor,
        podcast,
        device,
        action,
      });

      const response = PaginatedResponseSchema(EpisodeActionWithId).parse(
        toEpisodeActionPageResponse(result),
      );
      return ok(response);
    },
  },

  // b-ext: summary endpoint for dashboard
  "/api/b-ext/summary/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),

    async GET(req) {
      const { value: username } = stripExtension(req.params.username, ["json"]);
      const user = await requireAuth(req, ctx.db, ctx.sessions, username);

      const result = await getUserSummary(ctx.db, user.id);

      const response = toSummaryResponse(result);
      return ok(response);
    },
  },
}));

function toEpisodeActionInput(action: {
  podcast: string;
  episode: string;
  action: string;
  timestamp?: string | number;
  position?: number;
  started?: number;
  total?: number;
  device?: string;
  guid?: string;
  [key: string]: unknown;
}): EpisodeActionInput {
  const { podcast, episode, action: kind, timestamp, device, guid, ...extra } = action;

  return {
    podcastUrl: podcast,
    episodeUrl: episode,
    kind: kind.toLowerCase() as EpisodeActionInput["kind"],
    occurredAtUnix: normalizeTimestamp(timestamp),
    deviceId: device,
    position: action.position,
    started: action.started,
    total: action.total,
    metadata: { guid, ...extra },
  };
}
