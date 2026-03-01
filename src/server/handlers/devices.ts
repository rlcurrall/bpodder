import {
  DeviceUpdateRequest,
  DeviceListResponse,
  DeviceResponseType,
  SuccessResponse,
} from "@shared/schemas/index";

import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { options, methodNotAllowed, ok, forbidden, serverError, badRequest } from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

const validDeviceId = /^[\w.-]+$/;

export default createRouteHandlerMap((ctx) => ({
  "/api/2/devices/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),
    PUT: methodNotAllowed(),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async GET(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username === "current") {
          const devices = getDevicesWithCount(ctx, user.id);
          return ok(DeviceListResponse.parse(devices));
        }

        if (username !== user.name) {
          return forbidden("Access denied");
        }

        const devices = getDevicesWithCount(ctx, user.id);
        return ok(DeviceListResponse.parse(devices));
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "List devices handler error");
        return serverError("Server error");
      }
    },
  },

  "/api/2/devices/:username/:deviceid": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const { value: deviceid } = parseParam(req.params.deviceid);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username !== "current" && username !== user.name) {
          return forbidden("Access denied");
        }

        if (!validDeviceId.test(deviceid)) {
          return badRequest("Invalid device ID");
        }

        const rawBody = await req.json().catch(() => ({}));
        const body = DeviceUpdateRequest.parse(rawBody);

        // Check if device exists
        const existing = ctx.db.first<{
          id: number;
          caption: string | null;
          type: string | null;
        }>(
          "SELECT id, caption, type FROM devices WHERE user = ? AND deviceid = ?",
          user.id,
          deviceid,
        );

        if (existing) {
          // Existing device - only update supplied keys
          const updates: string[] = [];
          const params: (string | number)[] = [];

          if (Object.prototype.hasOwnProperty.call(rawBody, "caption")) {
            updates.push("caption = ?");
            params.push(body.caption ?? "");
          }
          if (Object.prototype.hasOwnProperty.call(rawBody, "type")) {
            updates.push("type = ?");
            params.push(body.type ?? "");
          }

          if (updates.length > 0) {
            params.push(existing.id);
            ctx.db.run(`UPDATE devices SET ${updates.join(", ")} WHERE id = ?`, ...params);
          }
        } else {
          // New device - insert with provided values (default to empty string)
          ctx.db.run(
            "INSERT INTO devices (user, deviceid, caption, type, data) VALUES (?, ?, ?, ?, NULL)",
            user.id,
            deviceid,
            body.caption ?? "",
            body.type ?? "",
          );
        }

        return ok(SuccessResponse.parse({}));
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Upsert device handler error");
        return serverError("Server error");
      }
    },
  },
}));

function getDevicesWithCount(ctx: AppContext, userId: number): DeviceResponseType[] {
  const rows = ctx.db.all<{
    deviceid: string;
    caption: string | null;
    type: string | null;
    subscriptions: number;
  }>(
    `
      SELECT
        d.deviceid,
        d.caption,
        d.type,
        (SELECT COUNT(*) FROM subscriptions s WHERE s.device = d.id AND s.deleted = 0) AS subscriptions
      FROM devices d
      WHERE d.user = ?
    `,
    userId,
  );

  return rows.map(
    (row): DeviceResponseType => ({
      id: row.deviceid,
      caption: row.caption ?? "",
      type: row.type ?? "",
      subscriptions: row.subscriptions,
    }),
  );
}
