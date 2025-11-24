import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { app, dialog } from "electron";
import { JSONFilePreset } from "lowdb/node";
import type { Database } from "./schemas";
import { defaultDatabase } from "./schemas";

type DB = Awaited<ReturnType<typeof JSONFilePreset<Database>>>;

let _db: DB | null = null;

async function validateDatabase(data: unknown): Promise<boolean> {
	if (!data || typeof data !== "object") return false;

	const db = data as Record<string, unknown>;

	// Check required arrays
	if (!Array.isArray(db.projects)) return false;
	if (!Array.isArray(db.workspaces)) return false;
	if (!Array.isArray(db.worktrees)) return false;
	if (!db.settings || typeof db.settings !== "object") return false;

	return true;
}

async function createBackup(dbPath: string): Promise<string | null> {
	try {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupPath = join(
			app.getPath("userData"),
			`db.backup.${timestamp}.json`,
		);
		copyFileSync(dbPath, backupPath);
		return backupPath;
	} catch (error) {
		console.error("Failed to create backup:", error);
		return null;
	}
}

export async function initDb(): Promise<void> {
	if (_db) return;

	const dbPath = join(app.getPath("userData"), "db.json");
	const dbExists = existsSync(dbPath);

	try {
		_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);

		// Validate database structure
		const isValid = await validateDatabase(_db.data);

		if (dbExists && !isValid) {
			// Database exists but is corrupted
			console.error("Database validation failed - corrupt file detected");

			const backupPath = await createBackup(dbPath);
			const backupMessage = backupPath
				? `A backup has been saved to:\n${backupPath}\n\n`
				: "Failed to create backup.\n\n";

			// Offer user choice
			const response = await dialog.showMessageBox({
				type: "error",
				title: "Database Corrupted",
				message:
					"The application database is corrupted and cannot be loaded.",
				detail: `${backupMessage}Would you like to reset the database? This will clear all data.`,
				buttons: ["Reset Database", "Exit Application"],
				defaultId: 0,
				cancelId: 1,
			});

			if (response.response === 0) {
				// Reset database
				_db.data = defaultDatabase;
				await _db.write();
				console.log("Database reset to defaults");
			} else {
				// Exit application
				console.log("User chose to exit due to corrupted database");
				app.quit();
				return;
			}
		}

		// Migration: ensure all required fields exist (for partially corrupt data)
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
	} catch (error) {
		console.error("Failed to initialize database:", error);

		// If initialization fails completely, offer to reset
		if (dbExists) {
			const backupPath = await createBackup(dbPath);
			const backupMessage = backupPath
				? `A backup has been saved to:\n${backupPath}\n\n`
				: "Failed to create backup.\n\n";

			const response = await dialog.showMessageBox({
				type: "error",
				title: "Database Error",
				message: "Failed to load application database.",
				detail: `${backupMessage}Error: ${error instanceof Error ? error.message : "Unknown error"}\n\nWould you like to reset the database?`,
				buttons: ["Reset Database", "Exit Application"],
				defaultId: 0,
				cancelId: 1,
			});

			if (response.response === 0) {
				// Reset database
				_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);
				_db.data = defaultDatabase;
				await _db.write();
				console.log("Database reset to defaults after initialization error");
			} else {
				// Exit application
				console.log("User chose to exit due to database error");
				app.quit();
				return;
			}
		} else {
			// No existing database, just create new one
			_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);
			await _db.write();
			console.log("Created new database after initialization error");
		}
	}
}

export const db = new Proxy({} as DB, {
	get(_target, prop) {
		if (!_db) {
			throw new Error("Database not initialized. Call initDb() first.");
		}
		return _db[prop as keyof DB];
	},
});
