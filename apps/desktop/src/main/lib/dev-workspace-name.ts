import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { workspaces, worktrees } from "@superset/local-db";
import BetterSqlite3 from "better-sqlite3";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getWorkspaceName as getEnvWorkspaceName } from "shared/env.shared";
import { deriveWorkspaceNameFromWorktreeSegments } from "shared/worktree-id";
import { localDb } from "./local-db";

const IS_DEV = process.env.NODE_ENV === "development";
const WORKTREE_BASE = path.resolve(homedir(), ".superset/worktrees");
const PROD_LOCAL_DB_PATH = path.join(homedir(), ".superset", "local.db");

function getWorktreeSegmentsFromCwd(cwd: string): string[] | undefined {
	const cwdRelative = path.relative(WORKTREE_BASE, cwd);
	if (
		!cwdRelative ||
		cwdRelative.startsWith("..") ||
		path.isAbsolute(cwdRelative)
	) {
		return undefined;
	}

	const segments = cwdRelative.split(path.sep).filter(Boolean);
	return segments.length >= 2 ? segments : undefined;
}

function getWorktreePathFromSegments(segments: string[]): string | undefined {
	const appsIndex = segments.lastIndexOf("apps");
	const endIndex =
		appsIndex > 1 && segments[appsIndex + 1] === "desktop"
			? appsIndex
			: segments.length;
	if (endIndex <= 1) return undefined;

	return path.join(WORKTREE_BASE, ...segments.slice(0, endIndex));
}

function getWorkspaceNameForPathFromCurrentDb(
	worktreePath: string,
): string | undefined {
	try {
		const rows = localDb
			.select({ name: workspaces.name })
			.from(workspaces)
			.innerJoin(worktrees, eq(workspaces.worktreeId, worktrees.id))
			.where(
				and(eq(worktrees.path, worktreePath), isNull(workspaces.deletingAt)),
			)
			.orderBy(desc(workspaces.lastOpenedAt))
			.all();
		const name = rows[0]?.name?.trim();
		return name ? name : undefined;
	} catch (error) {
		console.warn(
			"[dev-workspace-name] Failed to resolve workspace name from current DB:",
			error,
		);
		return undefined;
	}
}

function getWorkspaceNameForPathFromProdDb(
	worktreePath: string,
): string | undefined {
	if (!existsSync(PROD_LOCAL_DB_PATH)) return undefined;

	try {
		const prodDb = new BetterSqlite3(PROD_LOCAL_DB_PATH, {
			readonly: true,
			fileMustExist: true,
		});
		try {
			const row = prodDb
				.prepare(
					`SELECT w.name as name
					 FROM workspaces w
					 INNER JOIN worktrees wt ON w.worktree_id = wt.id
					 WHERE wt.path = ?
					   AND w.deleting_at IS NULL
					 ORDER BY w.last_opened_at DESC
					 LIMIT 1`,
				)
				.get(worktreePath) as { name?: string } | undefined;
			const name = row?.name?.trim();
			return name ? name : undefined;
		} finally {
			prodDb.close();
		}
	} catch (error) {
		console.warn(
			"[dev-workspace-name] Failed to resolve workspace name from prod DB:",
			error,
		);
		return undefined;
	}
}

export function resolveDevWorkspaceName(
	cwd = process.cwd(),
): string | undefined {
	if (!IS_DEV) return undefined;

	const segments = getWorktreeSegmentsFromCwd(cwd);
	if (!segments) return getEnvWorkspaceName();

	const workspaceNameFromPath =
		deriveWorkspaceNameFromWorktreeSegments(segments);
	const worktreePath = getWorktreePathFromSegments(segments);
	const workspaceNameFromDb = worktreePath
		? (getWorkspaceNameForPathFromCurrentDb(worktreePath) ??
			getWorkspaceNameForPathFromProdDb(worktreePath))
		: undefined;

	return workspaceNameFromDb ?? workspaceNameFromPath ?? getEnvWorkspaceName();
}
