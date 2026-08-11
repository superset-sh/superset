import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "../schema";
import { CHAT_DB_FILENAME } from "../schema";

export const DEFAULT_MIGRATIONS_FOLDER = resolve(
	fileURLToPath(new URL(".", import.meta.url)),
	"../drizzle",
);

export type ChatDbOptions = {
	dataDir: string;
	migrationsFolder?: string;
};

export type ChatDb = ReturnType<typeof createChatDb>;

export type OpenChatDb = (options: ChatDbOptions) => ChatDb;

export function createChatDb(options: ChatDbOptions) {
	mkdirSync(options.dataDir, { recursive: true });

	const sqlite = new Database(join(options.dataDir, CHAT_DB_FILENAME));
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("busy_timeout = 5000");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	// Let a failed migration throw — never serve a half-migrated DB.
	try {
		migrate(db, {
			migrationsFolder: options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
		});
	} catch (error) {
		sqlite.close();
		throw error;
	}

	return db;
}
