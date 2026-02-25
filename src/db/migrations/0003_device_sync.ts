import type { Database } from "bun:sqlite";

export const name = "0003_device_sync";

export function up(db: Database): void {
  // Add sync_group column to devices table for sync group membership
  db.run(`ALTER TABLE devices ADD COLUMN sync_group TEXT NULL`);

  // Create index for efficient sync group lookups
  db.run(
    `CREATE INDEX devices_sync_group ON devices (user, sync_group) WHERE sync_group IS NOT NULL`,
  );
}
