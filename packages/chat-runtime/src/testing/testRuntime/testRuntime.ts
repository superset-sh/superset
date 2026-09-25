import { Database as BunDatabase } from "bun:sqlite";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { ChatDb, ChatDbOptions } from "../../db";
import { CHAT_DB_FILENAME, DEFAULT_MIGRATIONS_FOLDER } from "../../db";
import * as schema from "../../db/schema";
import {
	type ChatRuntime,
	type ChatRuntimeOptions,
	createChatRuntime,
} from "../../index";

export function createBunChatDb(options: ChatDbOptions): ChatDb {
	mkdirSync(options.dataDir, { recursive: true });

	const sqlite = new BunDatabase(join(options.dataDir, CHAT_DB_FILENAME), {
		create: true,
		readwrite: true,
	});
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA busy_timeout = 5000");
	sqlite.exec("PRAGMA foreign_keys = ON");

	const db = drizzle(sqlite, { schema }) as unknown as ChatDb;
	migrate(db as never, {
		migrationsFolder: options.migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER,
	});

	return db;
}

export function createTestRuntime(
	options: Omit<ChatRuntimeOptions, "dataDir" | "openDatabase"> = {},
): ChatRuntime {
	const dataDir = mkdtempSync(join(tmpdir(), "chat-runtime-"));
	return createChatRuntime({
		dataDir,
		openDatabase: createBunChatDb,
		...options,
	});
}
