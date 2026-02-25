import type { Database } from "bun:sqlite";

import * as m0000 from "./0000_initial_schema";
import * as m0001 from "./0001_settings";

export interface Migration {
  name: string;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [m0000, m0001];
