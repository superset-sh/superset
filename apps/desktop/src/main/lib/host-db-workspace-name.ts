import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Minimal readonly handle satisfied by both better-sqlite3 and bun:sqlite. */
export interface ReadonlySqlite {
	prepare(sql: string): { get(...params: unknown[]): unknown };
	close(): void;
}

export const DEFAULT_HOST_DB_ROOT = join(homedir(), ".superset", "host");

/**
 * Resolve a workspace's display title from the outer (production) host-service
 * DBs at `~/.superset/host/<org>/host.db`. That row's `name` is what AI naming
 * and manual renames update, so reading it when the dev app starts means no
 * name has to be captured at setup time. Only columns every host-service
 * version has are referenced (older ones lack `archived_at`).
 */
export function getWorkspaceNameFromHostDbs(
	worktreePath: string,
	openReadonly: (dbPath: string) => ReadonlySqlite,
	hostDbRoot = DEFAULT_HOST_DB_ROOT,
): string | undefined {
	if (!existsSync(hostDbRoot)) return undefined;

	let entries: string[];
	try {
		entries = readdirSync(hostDbRoot);
	} catch (error) {
		console.warn(
			`[host-db-workspace-name] Failed to enumerate ${hostDbRoot}:`,
			error,
		);
		return undefined;
	}

	for (const entry of entries) {
		const dbPath = join(hostDbRoot, entry, "host.db");
		if (!existsSync(dbPath)) continue;
		try {
			const db = openReadonly(dbPath);
			try {
				const row = db
					.prepare(
						"SELECT name FROM workspaces WHERE worktree_path = ? LIMIT 1",
					)
					.get(worktreePath) as { name?: string } | undefined;
				const name = row?.name?.trim();
				if (name) return name;
			} finally {
				db.close();
			}
		} catch (error) {
			console.warn(
				`[host-db-workspace-name] Failed to read workspace name from ${dbPath}:`,
				error,
			);
		}
	}
	return undefined;
}
