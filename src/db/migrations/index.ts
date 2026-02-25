import type { Database } from "bun:sqlite";

import * as m0000 from "./0000_initial_schema";
import * as m0001 from "./0001_settings";
import * as m0002 from "./0002_per_device_subscriptions";
import * as m0003 from "./0003_device_sync";

export interface Migration {
  name: string;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [m0000, m0001, m0002, m0003];
