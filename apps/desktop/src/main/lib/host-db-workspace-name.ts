import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Minimal readonly handle satisfied by both better-sqlite3 and bun:sqlite. */
interface ReadonlySqlite {
	prepare(sql: string): {
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
	};
	close(): void;
}

const DEFAULT_HOST_DB_ROOT = join(homedir(), ".superset", "host");

function canonicalPath(path: string): string | undefined {
	try {
		return realpathSync(path);
	} catch {
		return undefined;
	}
}

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
	const canonicalWorktreePath = canonicalPath(worktreePath);

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
				if (canonicalWorktreePath) {
					const candidates = db
						.prepare("SELECT name, worktree_path FROM workspaces")
						.all() as { name: string | null; worktree_path: string | null }[];
					for (const candidate of candidates) {
						const candidateName = candidate.name?.trim();
						if (
							candidateName &&
							candidate.worktree_path &&
							canonicalPath(candidate.worktree_path) === canonicalWorktreePath
						) {
							return candidateName;
						}
					}
				}
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
