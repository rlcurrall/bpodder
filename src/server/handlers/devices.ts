import { requireAuth } from "@server/lib/auth";
import { getBody } from "@server/lib/body";
import { stripExtension } from "@server/lib/params";
import { options, methodNotAllowed, ok, forbidden, badRequest } from "@server/lib/response";
import { createRouteHandlerMap } from "@server/lib/routing";
import {
  DeviceUpdateRequest,
  DeviceListResponse,
  DeviceResponseType,
  SuccessResponse,
} from "@shared/schemas/index";

const validDeviceId = /^[\w.-]+$/;

export default createRouteHandlerMap((ctx) => ({
  "/api/2/devices/:username": {
    OPTIONS: options(["GET", "OPTIONS"]),
    PUT: methodNotAllowed(),
    POST: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async GET(req) {
      const { value: username } = stripExtension(req.params.username, ["json"]);
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
    },
  },

  "/api/2/devices/:username/:deviceid": {
    OPTIONS: options(["POST", "OPTIONS"]),
    GET: methodNotAllowed(),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),
    async POST(req) {
      const { value: username } = stripExtension(req.params.username, ["json"]);
      const { value: deviceid } = stripExtension(req.params.deviceid, ["json"]);
      const user = await requireAuth(req, ctx.db, ctx.sessions);

      if (username !== "current" && username !== user.name) {
        return forbidden("Access denied");
      }

      if (!validDeviceId.test(deviceid)) {
        return badRequest("Invalid device ID");
      }

      const body = await getBody(req, DeviceUpdateRequest);

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

        if (body.caption !== undefined) {
          updates.push("caption = ?");
          params.push(body.caption);
        }
        if (body.type !== undefined) {
          updates.push("type = ?");
          params.push(body.type);
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
