import { join } from "node:path";
import { exposeElectronSQLitePersistence } from "@tanstack/electron-db-sqlite-persistence/main";
import { createNodeSQLitePersistence } from "@tanstack/node-db-sqlite-persistence";
import Database from "better-sqlite3";
import { ipcMain } from "electron";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "../app-environment";
import { openSqliteWithRecovery } from "./sqlite-recovery";

let dispose: (() => void) | null = null;
let database: Database.Database | null = null;

function openTanstackDbPersistence(dbPath: string) {
	let opened: Database.Database | undefined;
	try {
		opened = new Database(dbPath);
		const persistence = createNodeSQLitePersistence({
			database: opened,
			appliedTxPruneMaxRows: 1_000,
			appliedTxPruneMaxAgeSeconds: 24 * 60 * 60,
		});
		return { database: opened, persistence };
	} catch (error) {
		opened?.close();
		throw error;
	}
}

export function initTanstackDbPersistence(): void {
	ensureSupersetHomeDirExists();
	// `tanstack-db.sqlite` is a local sync/cache DB, so a corrupt file (e.g. from
	// an interrupted auto-update) is recoverable by quarantining it and rebuilding
	// rather than crashing startup. See issue #5086.
	const dbPath = join(SUPERSET_HOME_DIR, "tanstack-db.sqlite");
	const result = openSqliteWithRecovery(dbPath, openTanstackDbPersistence);
	database = result.database;
	dispose = exposeElectronSQLitePersistence({
		ipcMain,
		persistence: result.persistence,
	});
}

export function shutdownTanstackDbPersistence(): void {
	dispose?.();
	dispose = null;
	database?.close();
	database = null;
}
