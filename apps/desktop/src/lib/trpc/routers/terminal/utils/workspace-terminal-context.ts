import {
	projects,
	type SelectWorkspace,
	workspaces,
	worktrees,
} from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";

const WORKSPACE_TERMINAL_CONTEXT_CACHE_TTL_MS = 500;
const MAX_WORKSPACE_TERMINAL_CONTEXT_CACHE_ENTRIES = 256;

export interface WorkspaceTerminalContext {
	workspace: SelectWorkspace | undefined;
	workspacePath: string | undefined;
	rootPath: string | undefined;
}

interface WorkspaceTerminalContextCacheEntry {
	value: WorkspaceTerminalContext;
	expiresAt: number;
}

const workspaceTerminalContextCache = new Map<
	string,
	WorkspaceTerminalContextCacheEntry
>();

function loadWorkspaceTerminalContext(
	workspaceId: string,
): WorkspaceTerminalContext {
	const row = localDb
		.select({
			workspace: workspaces,
			mainRepoPath: projects.mainRepoPath,
			worktreePath: worktrees.path,
		})
		.from(workspaces)
		.leftJoin(projects, eq(projects.id, workspaces.projectId))
		.leftJoin(worktrees, eq(worktrees.id, workspaces.worktreeId))
		.where(eq(workspaces.id, workspaceId))
		.get();

	if (!row?.workspace) {
		return {
			workspace: undefined,
			workspacePath: undefined,
			rootPath: undefined,
		};
	}

	return {
		workspace: row.workspace,
		workspacePath:
			row.workspace.type === "branch"
				? (row.mainRepoPath ?? undefined)
				: (row.worktreePath ?? undefined),
		rootPath: row.mainRepoPath ?? undefined,
	};
}

export function getWorkspaceTerminalContext(
	workspaceId: string,
): WorkspaceTerminalContext {
	const now = Date.now();
	const cached = workspaceTerminalContextCache.get(workspaceId);
	if (cached && cached.expiresAt > now) {
		return cached.value;
	}

	const value = loadWorkspaceTerminalContext(workspaceId);
	if (
		workspaceTerminalContextCache.size >=
		MAX_WORKSPACE_TERMINAL_CONTEXT_CACHE_ENTRIES
	) {
		workspaceTerminalContextCache.clear();
	}
	workspaceTerminalContextCache.set(workspaceId, {
		value,
		expiresAt: now + WORKSPACE_TERMINAL_CONTEXT_CACHE_TTL_MS,
	});
	return value;
}

export function clearWorkspaceTerminalContextCache(): void {
	workspaceTerminalContextCache.clear();
}
