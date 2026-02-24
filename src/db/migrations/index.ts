import type { Database } from "bun:sqlite";

import * as m0000 from "./0000_initial_schema";

export interface Migration {
  name: string;
  up: (db: Database) => void;
}

export const migrations: Migration[] = [m0000];
