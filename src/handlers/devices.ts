import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { json, error } from "../lib/response";
import { DeviceBody } from "../lib/schemas";
import type { HandlerContext } from "./auth";

interface Device {
  id: string;
  caption: string | null;
  type: string | null;
  subscriptions: number;
}

export function createDeviceHandlers(ctx: HandlerContext) {
  const validDeviceId = /^[\w.-]+$/;

  const getDevicesWithCount = (userId: number): Device[] => {
    const rows = ctx.db.all<{
      deviceid: string;
      caption: string | null;
      type: string | null;
    }>(
      "SELECT deviceid, caption, type FROM devices WHERE user = ?",
      userId
    );

    const subCount =
      ctx.db.first<{ count: number }>(
        "SELECT COUNT(*) as count FROM subscriptions WHERE user = ? AND deleted = 0",
        userId
      )?.count ?? 0;

    return rows.map((row) => ({
      id: row.deviceid,
      caption: row.caption,
      type: row.type,
      subscriptions: subCount,
    }));
  };

  return {
    // /api/2/devices/:username → username = "alice.json"
    listDevices: async (
      req: Request & { params: { username: string } }
    ): Promise<Response> => {
      if (req.method !== "GET") {
        return error("Method not allowed", 405);
      }

      try {
        const { value: username } = parseParam(req.params.username);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username === "current") {
          return json(getDevicesWithCount(user.id));
        }

        if (username !== user.name) {
          return error("Access denied", 403);
        }

        return json(getDevicesWithCount(user.id));
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "List devices handler error");
        return error("Server error", 500);
      }
    },

    // /api/2/devices/:username/:deviceid → deviceid = "phone.json"
    upsertDevice: async (
      req: Request & { params: { username: string; deviceid: string } }
    ): Promise<Response> => {
      if (req.method !== "POST") {
        return error("Method not allowed", 405);
      }

      try {
        const { value: username } = parseParam(req.params.username);
        const { value: deviceid } = parseParam(req.params.deviceid);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username !== "current" && username !== user.name) {
          return error("Access denied", 403);
        }

        if (!validDeviceId.test(deviceid)) {
          return error("Invalid device ID", 400);
        }

        const rawBody = await req.json().catch(() => ({}));
        const body = DeviceBody.parse(rawBody);

        ctx.db.upsert(
          "devices",
          {
            user: user.id,
            deviceid,
            caption: body.caption ?? null,
            type: body.type ?? null,
            data: null,
          },
          ["user", "deviceid"]
        );

        return json({});
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Upsert device handler error");
        return error("Server error", 500);
      }
    },
  };
}
