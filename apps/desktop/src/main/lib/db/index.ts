import { JSONFilePreset } from "lowdb/node";
import { DB_PATH } from "../app-environment";
import type { Database, Workspace } from "./schemas";
import { defaultDatabase } from "./schemas";

type DB = Awaited<ReturnType<typeof JSONFilePreset<Database>>>;

let _db: DB | null = null;

/**
 * Migrate existing workspaces to have type and branch fields.
 * Pre-existing workspaces without these fields are worktree-based.
 */
function migrateWorkspaceFields(db: DB): boolean {
	let needsWrite = false;

	for (const workspace of db.data.workspaces) {
		// Cast to check for missing fields (old schema)
		const ws = workspace as Partial<Workspace> & {
			id: string;
			worktreeId?: string;
		};

		// If type is missing, this is a pre-existing worktree workspace
		if (!ws.type) {
			ws.type = "worktree";
			needsWrite = true;
		}

		// If branch is missing, copy from associated worktree
		if (!ws.branch && ws.worktreeId) {
			const worktree = db.data.worktrees.find((w) => w.id === ws.worktreeId);
			if (worktree) {
				ws.branch = worktree.branch;
				needsWrite = true;
			}
		}

		// Fallback: if still no branch, use empty string (shouldn't happen)
		if (!ws.branch) {
			ws.branch = "";
			needsWrite = true;
		}
	}

	return needsWrite;
}

/**
 * Clean up duplicate branch workspaces per project.
 * Only one branch workspace is allowed per project (they share the same directory).
 * Keeps the most recently opened one and removes the rest.
 */
function cleanupDuplicateBranchWorkspaces(db: DB): boolean {
	// Group branch workspaces by projectId
	const branchWorkspacesByProject = new Map<string, Workspace[]>();
	for (const workspace of db.data.workspaces) {
		if (workspace.type === "branch") {
			const existing = branchWorkspacesByProject.get(workspace.projectId) ?? [];
			existing.push(workspace);
			branchWorkspacesByProject.set(workspace.projectId, existing);
		}
	}

	// Find projects with duplicates
	const idsToRemove: string[] = [];
	const keptWorkspaceIds: string[] = [];
	for (const [projectId, workspaces] of branchWorkspacesByProject) {
		if (workspaces.length > 1) {
			// Sort by lastOpenedAt descending, keep the first (most recent)
			workspaces.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt);
			const [keep, ...remove] = workspaces;
			keptWorkspaceIds.push(keep.id);
			for (const ws of remove) {
				idsToRemove.push(ws.id);
			}
			console.log(
				`[migration] Project ${projectId} has ${workspaces.length} branch workspaces, removing ${remove.length} duplicates`,
			);
		}
	}

	if (idsToRemove.length > 0) {
		// If lastActiveWorkspaceId points to a removed workspace, update it
		const lastActiveId = db.data.settings.lastActiveWorkspaceId;
		if (lastActiveId && idsToRemove.includes(lastActiveId)) {
			// Find which project this was for and use the kept workspace
			const removedWorkspace = db.data.workspaces.find(
				(w) => w.id === lastActiveId,
			);
			if (removedWorkspace) {
				const keptForProject = db.data.workspaces.find(
					(w) =>
						w.projectId === removedWorkspace.projectId &&
						w.type === "branch" &&
						keptWorkspaceIds.includes(w.id),
				);
				db.data.settings.lastActiveWorkspaceId =
					keptForProject?.id ?? undefined;
				console.log(
					`[migration] Updated lastActiveWorkspaceId from removed workspace to ${keptForProject?.id ?? "undefined"}`,
				);
			}
		}

		db.data.workspaces = db.data.workspaces.filter(
			(w) => !idsToRemove.includes(w.id),
		);
		return true;
	}

	return false;
}

export async function initDb(): Promise<void> {
	if (_db) return;

	const dbPath = DB_PATH;
	_db = await JSONFilePreset<Database>(dbPath, defaultDatabase);
	console.log(`Database initialized at: ${dbPath}`);

	// Run migrations
	const migrations = [
		{ name: "workspace fields", fn: migrateWorkspaceFields },
		{
			name: "duplicate branch workspaces",
			fn: cleanupDuplicateBranchWorkspaces,
		},
	];

	let needsWrite = false;
	for (const { name, fn } of migrations) {
		if (fn(_db)) {
			console.log(`[migration] Applied: ${name}`);
			needsWrite = true;
		}
	}

	if (needsWrite) {
		await _db.write();
	}
}

export const db = new Proxy({} as DB, {
	get(_target, prop) {
		if (!_db) {
			throw new Error("Database not initialized. Call initDb() first.");
		}
		return _db[prop as keyof DB];
	},
});
