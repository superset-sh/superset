/**
 * Database initialization and access
 * Uses lowdb for local JSON file storage
 */

import { JSONFilePreset } from "lowdb/node";
import { join } from "node:path";
import { app } from "electron";
import type { Database } from "./schemas";
import { defaultDatabase } from "./schemas";

let db: Awaited<ReturnType<typeof JSONFilePreset<Database>>> | null = null;

/**
 * Get database file path
 * Stored in ~/.superset/db.json
 */
function getDbPath(): string {
	const userDataPath = app.getPath("userData");
	return join(userDataPath, "db.json");
}

/**
 * Initialize the database
 * Should be called once when the app starts
 */
export async function initDatabase(): Promise<void> {
	if (db) {
		return;
	}

	const dbPath = getDbPath();
	db = await JSONFilePreset<Database>(dbPath, defaultDatabase);

	console.log(`Database initialized at: ${dbPath}`);
}

/**
 * Get the database instance
 * Throws if database hasn't been initialized
 */
export function getDb(): Awaited<ReturnType<typeof JSONFilePreset<Database>>> {
	if (!db) {
		throw new Error(
			"Database not initialized. Call initDatabase() first.",
		);
	}
	return db;
}

/**
 * Helper to read database data
 */
export function readDb(): Database {
	const database = getDb();
	return database.data;
}

/**
 * Helper to write database data
 * Automatically saves to file
 */
export async function writeDb(updater: (data: Database) => void): Promise<void> {
	const database = getDb();
	updater(database.data);
	await database.write();
}
