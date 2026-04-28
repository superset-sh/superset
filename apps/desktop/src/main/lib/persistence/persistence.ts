import { join } from "node:path";
import { exposeElectronSQLitePersistence } from "@tanstack/electron-db-sqlite-persistence/main";
import { createNodeSQLitePersistence } from "@tanstack/node-db-sqlite-persistence";
import Database from "better-sqlite3";
import { ipcMain } from "electron";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "../app-environment";

let dispose: (() => void) | null = null;
let database: Database.Database | null = null;

export function initTanstackDbPersistence(): void {
	ensureSupersetHomeDirExists();
	database = new Database(join(SUPERSET_HOME_DIR, "tanstack-db.sqlite"));
	const persistence = createNodeSQLitePersistence({ database });
	dispose = exposeElectronSQLitePersistence({ ipcMain, persistence });
}

export function shutdownTanstackDbPersistence(): void {
	dispose?.();
	dispose = null;
	database?.close();
	database = null;
}
