import type { Database } from "bun:sqlite";

export const name = "0002_per_device_subscriptions";

export function up(db: Database): void {
  // Step 1: Create new subscriptions table with device column
  db.run(`
    CREATE TABLE subscriptions_new (
      id      INTEGER PRIMARY KEY,
      user    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      device  INTEGER NOT NULL REFERENCES devices (id) ON DELETE CASCADE,
      feed    INTEGER NULL REFERENCES feeds (id) ON DELETE SET NULL,
      url     TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      changed INTEGER NOT NULL,
      data    TEXT NULL
    )
  `);

  // Step 2: Create _default devices for users with subscriptions but no devices
  db.run(`
    INSERT INTO devices (user, deviceid, caption, type, data)
    SELECT DISTINCT 
      s.user,
      '_default',
      'Default Device',
      'other',
      NULL
    FROM subscriptions s
    LEFT JOIN devices d ON d.user = s.user
    WHERE d.id IS NULL
  `);

  // Step 3: Migrate subscriptions to new table with device assignment
  // Each subscription gets assigned to the user's first device
  db.run(`
    INSERT INTO subscriptions_new (id, user, device, feed, url, deleted, changed, data)
    SELECT 
      s.id,
      s.user,
      (SELECT MIN(d.id) FROM devices d WHERE d.user = s.user),
      s.feed,
      s.url,
      s.deleted,
      s.changed,
      s.data
    FROM subscriptions s
  `);

  // Step 4: Drop old table and indexes
  db.run(`DROP INDEX IF EXISTS subscriptions_unique`);
  db.run(`DROP INDEX IF EXISTS subscription_feed`);
  db.run(`DROP TABLE subscriptions`);

  // Step 5: Rename new table to final name
  db.run(`ALTER TABLE subscriptions_new RENAME TO subscriptions`);

  // Step 6: Create indexes on renamed table
  db.run(`CREATE UNIQUE INDEX subscriptions_unique ON subscriptions (url, user, device)`);
  db.run(`CREATE INDEX subscriptions_device ON subscriptions (device)`);
  db.run(`CREATE INDEX subscriptions_user_device_changed ON subscriptions (user, device, changed)`);
  db.run(`CREATE INDEX subscription_feed ON subscriptions (feed)`);
}
