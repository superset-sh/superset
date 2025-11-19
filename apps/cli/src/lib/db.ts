import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { LowdbAdapter } from "./storage/lowdb-adapter";

let adapter: LowdbAdapter | null = null;

/**
 * Get or create the database adapter instance.
 * Database is stored at ~/.superset/db.json
 */
export function getDb(): LowdbAdapter {
	if (adapter) {
		return adapter;
	}

	// Create ~/.superset directory if it doesn't exist
	const supersetDir = join(homedir(), ".superset");
	if (!existsSync(supersetDir)) {
		mkdirSync(supersetDir, { recursive: true });
	}

	const dbPath = join(supersetDir, "db.json");
	adapter = new LowdbAdapter(dbPath);

	return adapter;
}
