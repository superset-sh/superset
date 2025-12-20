import { JSONFilePreset } from "lowdb/node";
import { DB_PATH } from "../app-environment";
import type { Database, Workspace } from "./schemas";
import { defaultDatabase } from "./schemas";

type DB = Awaited<ReturnType<typeof JSONFilePreset<Database>>>;

let _db: DB | null = null;

/**
 * Migrate existing workspaces to include type and branch fields.
 * Existing workspaces are all worktree-based.
 */
async function migrateWorkspaces(database: DB): Promise<void> {
	let needsWrite = false;

	for (const workspace of database.data.workspaces) {
		// Cast to allow checking for missing fields
		const ws = workspace as Workspace & { type?: string; branch?: string };

		// Add type field if missing (existing workspaces are all worktree type)
		if (!ws.type) {
			ws.type = "worktree";
			needsWrite = true;
		}

		// Add branch field if missing (copy from associated worktree)
		if (!ws.branch) {
			if (ws.worktreeId) {
				const worktree = database.data.worktrees.find(
					(wt) => wt.id === ws.worktreeId,
				);
				if (worktree) {
					ws.branch = worktree.branch;
				} else {
					console.warn(
						`Migration: Worktree ${ws.worktreeId} not found for workspace ${ws.id}, using fallback branch`,
					);
					ws.branch = "unknown";
				}
			} else {
				// Workspace without worktreeId (shouldn't happen for existing data, but be safe)
				console.warn(
					`Migration: Workspace ${ws.id} has no worktreeId, using fallback branch`,
				);
				ws.branch = "unknown";
			}
			needsWrite = true;
		}
	}

	if (needsWrite) {
		await database.write();
		console.log("Migrated workspaces to include type and branch fields");
	}
}

export async function initDb(): Promise<void> {
	if (_db) return;

	const dbPath = DB_PATH;
	_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);
	console.log(`Database initialized at: ${dbPath}`);

	// Run migrations
	await migrateWorkspaces(_db);
}

export const db = new Proxy({} as DB, {
	get(_target, prop) {
		if (!_db) {
			throw new Error("Database not initialized. Call initDb() first.");
		}
		return _db[prop as keyof DB];
	},
});
