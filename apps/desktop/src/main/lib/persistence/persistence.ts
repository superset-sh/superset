import { join } from "node:path";
import { exposeElectronSQLitePersistence } from "@tanstack/electron-db-sqlite-persistence/main";
import { createNodeSQLitePersistence } from "@tanstack/node-db-sqlite-persistence";
import Database from "better-sqlite3";
import { ipcMain } from "electron";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "../app-environment";
import { openSqliteWithRecovery } from "../sqlite-recovery";

let dispose: (() => void) | null = null;
let database: Database.Database | null = null;

export function initTanstackDbPersistence(): void {
	ensureSupersetHomeDirExists();
	const dbPath = join(SUPERSET_HOME_DIR, "tanstack-db.sqlite");

	// tanstack-db.sqlite is a pure sync cache with no migrations, so a corrupt
	// file (e.g. truncated by an interrupted auto-update) is safe to quarantine
	// and rebuild from the server rather than crashing startup.
	const { database: db, persistence } = openSqliteWithRecovery(
		dbPath,
		"tanstack-db",
		() => {
			const opened = new Database(dbPath);
			try {
				const persistence = createNodeSQLitePersistence({
					database: opened,
					appliedTxPruneMaxRows: 1_000,
					appliedTxPruneMaxAgeSeconds: 24 * 60 * 60,
				});
				return { database: opened, persistence };
			} catch (error) {
				// Release the handle so the file can be renamed on Windows.
				opened.close();
				throw error;
			}
		},
	);

	database = db;
	dispose = exposeElectronSQLitePersistence({ ipcMain, persistence });
}

export function shutdownTanstackDbPersistence(): void {
	dispose?.();
	dispose = null;
	database?.close();
	database = null;
}
