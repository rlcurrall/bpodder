import { SyncRequest, SyncStatusResponse } from "@shared/schemas/index";

import { requireAuth } from "../lib/auth";
import { parseParam } from "../lib/params";
import { options, methodNotAllowed, ok, badRequest, forbidden, serverError } from "../lib/response";
import { createRouteHandlerMap } from "../lib/routing";

export default createRouteHandlerMap((ctx) => ({
  "/api/2/sync-devices/:username": {
    OPTIONS: options(["GET", "POST", "OPTIONS"]),
    PUT: methodNotAllowed(),
    DELETE: methodNotAllowed(),

    async GET(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username === "current") {
          // Continue with current user
        } else if (username !== user.name) {
          return forbidden("Access denied");
        }

        const status = getSyncStatus(ctx, user.id);
        return ok(SyncStatusResponse.parse(status));
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Get sync devices handler error");
        return serverError("Server error");
      }
    },

    async POST(req) {
      try {
        const { value: username } = parseParam(req.params.username);
        const user = await requireAuth(req, ctx.db, ctx.sessions);

        if (username === "current") {
          // Continue with current user
        } else if (username !== user.name) {
          return forbidden("Access denied");
        }

        const rawBody = await req.json().catch(() => ({}));
        const parseResult = SyncRequest.safeParse(rawBody);

        if (!parseResult.success) {
          return badRequest(parseResult.error);
        }

        const { synchronize, "stop-synchronize": stopSync } = parseResult.data;

        // Collect all device IDs that need validation
        const allDeviceIds = new Set<string>();
        if (synchronize) {
          for (const group of synchronize) {
            for (const deviceId of group) {
              allDeviceIds.add(deviceId);
            }
          }
        }
        if (stopSync) {
          for (const deviceId of stopSync) {
            allDeviceIds.add(deviceId);
          }
        }

        // Validate all devices exist before starting transaction
        const validation = validateDevicesExist(ctx, user.id, Array.from(allDeviceIds));
        if (!validation.valid) {
          return badRequest(`Device not found: ${validation.missing}`);
        }

        ctx.db.transaction(() => {
          // Handle synchronize requests
          if (synchronize && synchronize.length > 0) {
            for (const deviceGroup of synchronize) {
              if (deviceGroup.length === 0) continue;

              // Collect all existing sync groups from devices in this group
              const existingGroups = new Set<string>();
              for (const deviceId of deviceGroup) {
                const device = ctx.db.first<{ sync_group: string | null }>(
                  "SELECT sync_group FROM devices WHERE user = ? AND deviceid = ?",
                  user.id,
                  deviceId,
                );
                if (device?.sync_group) {
                  existingGroups.add(device.sync_group);
                }
              }

              // Use first existing group or create new one
              const syncGroup = existingGroups.values().next().value ?? crypto.randomUUID();

              // Merge: update ALL devices in ANY of the existing groups to the chosen group
              if (existingGroups.size > 1) {
                for (const oldGroup of existingGroups) {
                  if (oldGroup !== syncGroup) {
                    ctx.db.run(
                      "UPDATE devices SET sync_group = ? WHERE user = ? AND sync_group = ?",
                      syncGroup,
                      user.id,
                      oldGroup,
                    );
                  }
                }
              }

              // Update all devices in the requested group
              for (const deviceId of deviceGroup) {
                ctx.db.run(
                  "UPDATE devices SET sync_group = ? WHERE user = ? AND deviceid = ?",
                  syncGroup,
                  user.id,
                  deviceId,
                );
              }
            }
          }

          // Handle stop-synchronize requests
          if (stopSync && stopSync.length > 0) {
            // Remove sync_group from specified devices
            for (const deviceId of stopSync) {
              ctx.db.run(
                "UPDATE devices SET sync_group = NULL WHERE user = ? AND deviceid = ?",
                user.id,
                deviceId,
              );
            }
          }
        });

        const status = getSyncStatus(ctx, user.id);
        return ok(SyncStatusResponse.parse(status));
      } catch (e) {
        if (e instanceof Response) return e;
        ctx.logger.error({ err: e }, "Post sync devices handler error");
        return serverError("Server error");
      }
    },
  },
}));

function getSyncStatus(
  ctx: AppContext,
  userId: number,
): {
  synchronized: string[][];
  "not-synchronized": string[];
} {
  // Get all devices with their sync_group
  const devices = ctx.db.all<{
    deviceid: string;
    sync_group: string | null;
  }>("SELECT deviceid, sync_group FROM devices WHERE user = ?", userId);

  // Group devices by sync_group
  const groupMap = new Map<string, string[]>();
  const notSynced: string[] = [];

  for (const device of devices) {
    if (device.sync_group) {
      const group = groupMap.get(device.sync_group) ?? [];
      group.push(device.deviceid);
      groupMap.set(device.sync_group, group);
    } else {
      notSynced.push(device.deviceid);
    }
  }

  // Convert map to array of groups, sorted for consistency
  const synchronized = Array.from(groupMap.values()).map((group) => group.sort());

  return {
    synchronized,
    "not-synchronized": notSynced.sort(),
  };
}

const validateDevicesExist = (
  ctx: AppContext,
  userId: number,
  deviceIds: string[],
): { valid: boolean; missing?: string } => {
  for (const deviceId of deviceIds) {
    const device = ctx.db.first<{ id: number }>(
      "SELECT id FROM devices WHERE user = ? AND deviceid = ?",
      userId,
      deviceId,
    );
    if (!device) {
      return { valid: false, missing: deviceId };
    }
  }
  return { valid: true };
};
