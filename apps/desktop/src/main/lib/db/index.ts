import { JSONFilePreset } from "lowdb/node";
import { DB_PATH } from "../app-environment";
import type { Database } from "./schemas";
import { defaultDatabase } from "./schemas";

type DB = Awaited<ReturnType<typeof JSONFilePreset<Database>>>;

let _db: DB | null = null;

export async function initDb(): Promise<void> {
	if (_db) return;

	const dbPath = DB_PATH;
	_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);
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
