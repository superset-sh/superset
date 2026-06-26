import {
	existsSync,
	type FSWatcher,
	readdirSync,
	readFileSync,
	watch,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { projects } from "@superset/local-db";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { localDb } from "main/lib/local-db";

/**
 * Resolves the local repo path that owns a project's .superset/config.json.
 *
 * v1 local projects live in the local DB with an explicit mainRepoPath. v2
 * cloud projects don't — but whenever any of their workspaces runs on this
 * machine, the per-organization host service records the project's local
 * checkout in its own DB (~/.superset/host/<orgId>/host.db, projects table,
 * repo_path keyed by the cloud project id). Reading that DB directly
 * (read-only) is cheap, needs no host-service round trip, and works even
 * while the service is stopped. Returns null when the project has no local
 * checkout anywhere — callers fall back to defaults.
 */
export function resolveWorkspaceCardRepoPath(projectId: string): string | null {
	const project = localDb
		.select()
		.from(projects)
		.where(eq(projects.id, projectId))
		.get();
	if (project?.mainRepoPath) {
		return project.mainRepoPath;
	}
	return (
		resolveV2ProjectRepoPath(projectId) ??
		resolveWorktreeProjectRepoPath(projectId)
	);
}

function resolveV2ProjectRepoPath(projectId: string): string | null {
	const hostRoot = join(SUPERSET_HOME_DIR, "host");
	let orgIds: string[];
	try {
		orgIds = readdirSync(hostRoot);
	} catch {
		return null;
	}

	for (const orgId of orgIds) {
		const dbPath = join(hostRoot, orgId, "host.db");
		if (!existsSync(dbPath)) continue;
		try {
			const db = new Database(dbPath, { readonly: true, fileMustExist: true });
			try {
				const row = db
					.prepare("SELECT repo_path AS repoPath FROM projects WHERE id = ?")
					.get(projectId) as { repoPath?: string } | undefined;
				if (row?.repoPath && existsSync(row.repoPath)) {
					return row.repoPath;
				}
			} finally {
				db.close();
			}
		} catch {
			// Locked, corrupt, or schema-less DB — try the next organization.
		}
	}
	return null;
}

/**
 * Extracts the main repo path from the contents of a git worktree `.git` file.
 * The file format is: `gitdir: <mainRepo>/.git/worktrees/<name>`
 * Returns null if the content doesn't match the expected pattern.
 */
export function extractMainRepoFromGitdir(content: string): string | null {
	const match = /^gitdir: (.*)\/\.git\/worktrees\//.exec(content.trim());
	return match?.[1] ?? null;
}

/**
 * Third-tier fallback: scans ~/.superset/worktrees/<projectId>/ for any local
 * worktree that belongs to this project. For each subdirectory:
 *   1. If it has a .superset/config.json, return the subdirectory directly
 *      (branch-local copy of the shared config is acceptable).
 *   2. Otherwise read the .git file and parse the main repo path from the
 *      standard `gitdir: <mainRepo>/.git/worktrees/<name>` format.
 * Returns null when nothing resolves.
 */
function resolveWorktreeProjectRepoPath(projectId: string): string | null {
	const worktreesDir = join(SUPERSET_HOME_DIR, "worktrees", projectId);

	// Containment check: projectId must not escape the worktrees root directory.
	const resolvedDir = resolve(worktreesDir);
	const worktreesRoot = resolve(join(SUPERSET_HOME_DIR, "worktrees"));
	if (
		resolvedDir !== worktreesRoot &&
		!resolvedDir.startsWith(worktreesRoot + sep)
	) {
		return null;
	}

	let entries: string[];
	try {
		entries = readdirSync(worktreesDir);
	} catch {
		return null;
	}

	for (const entry of entries) {
		const worktreePath = join(worktreesDir, entry);

		// Prefer a subdirectory with its own .superset/config.json.
		if (existsSync(join(worktreePath, ".superset", "config.json"))) {
			return worktreePath;
		}

		// Fall back to parsing the .git file for the main repo path.
		const gitFilePath = join(worktreePath, ".git");
		try {
			const gitContent = readFileSync(gitFilePath, "utf8");
			const mainRepo = extractMainRepoFromGitdir(gitContent);
			if (mainRepo && existsSync(mainRepo)) {
				return mainRepo;
			}
		} catch {
			// Not a file, or not readable — skip.
		}
	}
	return null;
}

const CONFIG_FILE_NAME = "config.json";
const WATCH_DEBOUNCE_MS = 250;

/**
 * Watches <repoPath>/.superset/config.json for changes, debounced. When the
 * .superset directory doesn't exist yet, watches the repo root for its
 * creation and re-arms. Returns a cleanup function.
 */
export function watchWorkspaceCardConfigFile(
	repoPath: string,
	onChange: () => void,
): () => void {
	const supersetDir = join(repoPath, ".superset");
	let configWatcher: FSWatcher | null = null;
	let repoWatcher: FSWatcher | null = null;
	let debounce: NodeJS.Timeout | null = null;
	let closed = false;

	const fire = () => {
		if (debounce) clearTimeout(debounce);
		debounce = setTimeout(() => {
			debounce = null;
			onChange();
		}, WATCH_DEBOUNCE_MS);
	};

	const watchConfigDir = () => {
		if (closed || configWatcher) return;
		try {
			configWatcher = watch(supersetDir, (_event, filename) => {
				// Some platforms omit the filename — treat that as a possible hit.
				if (filename && filename !== CONFIG_FILE_NAME) return;
				fire();
			});
			configWatcher.on("error", () => {
				configWatcher?.close();
				configWatcher = null;
			});
		} catch {
			// Directory vanished between the existence check and the watch.
		}
	};

	if (existsSync(supersetDir)) {
		watchConfigDir();
	} else {
		try {
			repoWatcher = watch(repoPath, (_event, filename) => {
				if (filename !== ".superset" || !existsSync(supersetDir)) return;
				watchConfigDir();
				// Release the repo-level watcher now that configWatcher is armed.
				repoWatcher?.close();
				repoWatcher = null;
				fire();
			});
			repoWatcher.on("error", () => {
				repoWatcher?.close();
				repoWatcher = null;
			});
		} catch {
			// Repo path itself is gone — nothing to watch.
		}
	}

	return () => {
		closed = true;
		if (debounce) clearTimeout(debounce);
		configWatcher?.close();
		repoWatcher?.close();
	};
}
