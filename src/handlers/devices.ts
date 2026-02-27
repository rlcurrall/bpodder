import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { options, methodNotAllowed, ok, forbidden, serverError, badRequest } from "../lib/response";
import { DeviceBody, DeviceType } from "../lib/schemas";

const validDeviceId = /^[\w.-]+$/;

export function createDeviceHandlers(ctx: AppContext): {
  listDevices: RouteDefinition<"/api/2/devices/:username">;
  upsertDevice: RouteDefinition<"/api/2/devices/:username/:deviceid">;
} {
  const getDevicesWithCount = (userId: number): DeviceType[] => {
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
      (row): DeviceType => ({
        id: row.deviceid,
        caption: row.caption ?? "",
        type: row.type ?? "",
        subscriptions: row.subscriptions,
      }),
    );
  };

  return {
    // /api/2/devices/:username → username = "alice.json"
    listDevices: {
      OPTIONS: options(["GET", "OPTIONS"]),
      PUT: methodNotAllowed(),
      POST: methodNotAllowed(),
      DELETE: methodNotAllowed(),
      async GET(req) {
        try {
          const { value: username } = parseParam(req.params.username);
          const user = await requireAuth(req, ctx.db, ctx.sessions);

          if (username === "current") {
            return ok(getDevicesWithCount(user.id));
          }

          if (username !== user.name) {
            return forbidden("Access denied");
          }

          return ok(getDevicesWithCount(user.id));
        } catch (e) {
          if (e instanceof Response) return e;
          ctx.logger.error({ err: e }, "List devices handler error");
          return serverError("Server error");
        }
      },
    },

    // /api/2/devices/:username/:deviceid → deviceid = "phone.json"
    upsertDevice: {
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
          const body = DeviceBody.parse(rawBody);

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

          return ok({});
        } catch (e) {
          if (e instanceof Response) return e;
          ctx.logger.error({ err: e }, "Upsert device handler error");
          return serverError("Server error");
        }
      },
    },
  };
}
