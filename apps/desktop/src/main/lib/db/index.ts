import { join } from "node:path";
import { app } from "electron";
import { JSONFilePreset } from "lowdb/node";
import type { Database } from "./schemas";
import { defaultDatabase } from "./schemas";

type DB = Awaited<ReturnType<typeof JSONFilePreset<Database>>>;

let _db: DB | null = null;

export async function initDb(): Promise<void> {
	if (_db) return;

	const dbPath = join(app.getPath("userData"), "db.json");
	_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);

	// Migration: ensure all required arrays exist
	let needsWrite = false;
	if (!Array.isArray(_db.data.projects)) {
		_db.data.projects = [];
		needsWrite = true;
	}
	if (!Array.isArray(_db.data.workspaces)) {
		_db.data.workspaces = [];
		needsWrite = true;
	}
	if (!Array.isArray(_db.data.worktrees)) {
		_db.data.worktrees = [];
		needsWrite = true;
	}
	if (!_db.data.settings || typeof _db.data.settings !== "object") {
		_db.data.settings = {};
		needsWrite = true;
	}

	if (needsWrite) {
		await _db.write();
		console.log("Database migrated: added missing arrays/objects");
	}

	console.log(`Database initialized at: ${dbPath}`);
}

export const db = new Proxy({} as DB, {
	get(_target, prop) {
		if (!_db) {
			throw new Error("Database not initialized. Call initDb() first.");
		}
		return _db[prop as keyof DB];
	},
});
