import { LowdbAdapter } from "./storage/lowdb-adapter";

let adapter: LowdbAdapter | null = null;

/**
 * Get or create the database adapter instance.
 * Database path is determined by storage config (defaults to ~/.superset/cli/db.json)
 */
export function getDb(): LowdbAdapter {
	if (adapter) {
		return adapter;
	}

	// LowdbAdapter will use getDbPath() from config
	adapter = new LowdbAdapter();

	return adapter;
}
