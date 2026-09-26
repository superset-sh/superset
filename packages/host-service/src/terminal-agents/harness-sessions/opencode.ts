import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { HarnessSessionStore } from "./types";

/** OpenCode keeps sessions in a SQLite database in its data directory. */
export const opencodeSessionStore: HarnessSessionStore = {
	hasSession({ sessionId }) {
		const dbPath = join(
			homedir(),
			".local",
			"share",
			"opencode",
			"opencode.db",
		);
		if (!existsSync(dbPath)) return null;
		// better-sqlite3, not `bun:sqlite`: the host service runs under
		// Electron's Node, where a Bun built-in does not exist and the import
		// crashes the process on boot.
		//
		// Read-only, but NOT `immutable`: that flag ignores the write-ahead log,
		// so a session written moments ago reads as absent.
		const db = new Database(dbPath, { readonly: true });
		try {
			const row = db
				.prepare("select 1 from session where id = ? limit 1")
				.get(sessionId);
			return row !== null && row !== undefined;
		} finally {
			db.close();
		}
	},
};
