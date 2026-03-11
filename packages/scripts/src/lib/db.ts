import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DB_PATH = join(homedir(), ".superset", "local.db");

export interface Project {
	id: string;
	main_repo_path: string;
	name: string;
	color: string;
	tab_order: number | null;
	last_opened_at: number;
	created_at: number;
	default_branch: string | null;
	worktree_base_dir: string | null;
}

export interface Workspace {
	id: string;
	project_id: string;
	worktree_id: string | null;
	type: "worktree" | "branch";
	branch: string;
	name: string;
	tab_order: number;
	last_opened_at: number;
	deleting_at: number | null;
}

export interface Worktree {
	id: string;
	project_id: string;
	path: string;
	branch: string;
	base_branch: string | null;
}

function getDb(): Database {
	if (!existsSync(DB_PATH)) {
		throw new Error(
			"Superset database not found. Is the desktop app installed?",
		);
	}

	return new Database(DB_PATH, { readonly: true });
}

export function findProjectByPath(absPath: string): Project | null {
	const db = getDb();
	return db
		.query<Project, [string]>(
			"SELECT * FROM projects WHERE main_repo_path = ? LIMIT 1",
		)
		.get(absPath);
}

export function getAllProjects(): Project[] {
	const db = getDb();
	return db
		.query<Project, []>("SELECT * FROM projects ORDER BY last_opened_at DESC")
		.all();
}

export interface WorkspaceWithWorktree {
	ws_id: string;
	ws_name: string;
	ws_type: "worktree" | "branch";
	ws_branch: string;
	ws_last_opened_at: number;
	wt_id: string | null;
	wt_path: string | null;
	wt_branch: string | null;
}

export function getWorkspacesForProject(
	projectId: string,
): WorkspaceWithWorktree[] {
	const db = getDb();
	return db
		.query<WorkspaceWithWorktree, [string]>(
			`SELECT
				w.id as ws_id,
				w.name as ws_name,
				w.type as ws_type,
				w.branch as ws_branch,
				w.last_opened_at as ws_last_opened_at,
				wt.id as wt_id,
				wt.path as wt_path,
				wt.branch as wt_branch
			FROM workspaces w
			LEFT JOIN worktrees wt ON w.worktree_id = wt.id
			WHERE w.project_id = ? AND w.deleting_at IS NULL
			ORDER BY w.last_opened_at DESC`,
		)
		.all(projectId);
}

export function findWorkspaceByBranch(
	projectId: string,
	branch: string,
): Workspace | null {
	const db = getDb();
	return db
		.query<Workspace, [string, string]>(
			"SELECT * FROM workspaces WHERE project_id = ? AND branch = ? AND deleting_at IS NULL LIMIT 1",
		)
		.get(projectId, branch);
}
