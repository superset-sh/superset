import { EventEmitter } from "node:events";
import { existsSync, type FSWatcher, watch } from "node:fs";
import path from "node:path";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { eq, isNotNull } from "drizzle-orm";
import { resolveWorkspaceBaseBranch } from "lib/trpc/routers/workspaces/utils/base-branch";
import { setBranchBaseConfig } from "lib/trpc/routers/workspaces/utils/base-branch-config";
import {
	activateProject,
	deleteWorkspace,
	deleteWorktreeRecord,
	getMaxProjectChildTabOrder,
	hideProjectIfNoWorkspaces,
	updateActiveWorkspaceIfRemoved,
} from "lib/trpc/routers/workspaces/utils/db-helpers";
import {
	listExternalWorktrees,
	worktreeExists,
} from "lib/trpc/routers/workspaces/utils/git";
import { copySupersetConfigToWorktree } from "lib/trpc/routers/workspaces/utils/setup";
import { track } from "./analytics";
import { localDb } from "./local-db";

export interface WorktreeSyncEvent {
	projectId: string;
	imported: number;
	removed: number;
}

/**
 * Watches `.git/worktrees/` directories for each registered project
 * and auto-syncs worktree state (imports new, removes stale) on changes.
 */
class WorktreeSyncService extends EventEmitter {
	private watchers = new Map<string, FSWatcher>();
	private debounceTimers = new Map<string, NodeJS.Timeout>();
	private syncInProgress = new Set<string>();
	private pendingResync = new Map<string, string | undefined>();

	private static readonly DEBOUNCE_MS = 1500;

	/**
	 * Start watching the `.git/worktrees/` directory for a project.
	 */
	startWatching(projectId: string, mainRepoPath: string): void {
		if (this.watchers.has(projectId)) {
			return;
		}

		const gitWorktreesDir = path.join(mainRepoPath, ".git", "worktrees");

		if (!existsSync(gitWorktreesDir)) {
			// No worktrees directory yet — it will be created when the first worktree is added.
			// We also watch the .git dir itself so we can detect when .git/worktrees/ appears.
			this.watchParentForWorktreesDir(projectId, mainRepoPath);
			return;
		}

		this.attachWatcher(projectId, mainRepoPath, gitWorktreesDir);
	}

	/**
	 * Watch the .git directory for creation of the worktrees/ subdirectory.
	 */
	private watchParentForWorktreesDir(
		projectId: string,
		mainRepoPath: string,
	): void {
		const gitDir = path.join(mainRepoPath, ".git");
		if (!existsSync(gitDir)) return;

		try {
			const worktreesDir = path.join(gitDir, "worktrees");
			const watcher = watch(gitDir, (_eventType, filename) => {
				// filename can be null or unreliable on some platforms — always verify on disk
				if (
					(filename === "worktrees" || filename === null) &&
					existsSync(worktreesDir)
				) {
					// The worktrees directory just appeared — switch to watching it directly
					watcher.close();
					this.watchers.delete(projectId);
					this.startWatching(projectId, mainRepoPath);
					// Sync now to catch worktrees created during the handoff gap
					this.debouncedSync(projectId, mainRepoPath);
				}
			});

			watcher.on("error", (error) => {
				console.warn(
					`[worktree-sync] .git watcher error for project ${projectId}:`,
					error,
				);
				watcher.close();
				this.watchers.delete(projectId);
			});

			this.watchers.set(projectId, watcher);
		} catch (error) {
			console.warn(
				`[worktree-sync] Failed to watch .git for project ${projectId}:`,
				error,
			);
		}
	}

	/**
	 * Attach a filesystem watcher to the `.git/worktrees/` directory and trigger
	 * a debounced sync whenever its contents change.
	 */
	private attachWatcher(
		projectId: string,
		mainRepoPath: string,
		gitWorktreesDir: string,
	): void {
		try {
			const watcher = watch(gitWorktreesDir, { recursive: false }, () => {
				this.debouncedSync(projectId, mainRepoPath);
			});

			watcher.on("error", (error) => {
				console.warn(
					`[worktree-sync] Watcher error for project ${projectId}:`,
					error,
				);
				watcher.close();
				this.watchers.delete(projectId);
			});

			this.watchers.set(projectId, watcher);
			console.log(
				`[worktree-sync] Watching ${gitWorktreesDir} for project ${projectId}`,
			);
		} catch (error) {
			console.warn(
				`[worktree-sync] Failed to watch ${gitWorktreesDir}:`,
				error,
			);
		}
	}

	/**
	 * Stop watching a specific project.
	 */
	stopWatching(projectId: string): void {
		const timer = this.debounceTimers.get(projectId);
		if (timer) {
			clearTimeout(timer);
			this.debounceTimers.delete(projectId);
		}

		this.pendingResync.delete(projectId);

		const watcher = this.watchers.get(projectId);
		if (watcher) {
			watcher.close();
			this.watchers.delete(projectId);
		}
	}

	/**
	 * Stop all watchers.
	 */
	stopAll(): void {
		for (const projectId of this.watchers.keys()) {
			this.stopWatching(projectId);
		}
	}

	/**
	 * Start watching all active projects (projects with a non-null tabOrder).
	 */
	startWatchingAllActiveProjects(): void {
		const activeProjects = localDb
			.select({ id: projects.id, mainRepoPath: projects.mainRepoPath })
			.from(projects)
			.where(isNotNull(projects.tabOrder))
			.all();

		for (const project of activeProjects) {
			this.startWatching(project.id, project.mainRepoPath);
		}

		if (activeProjects.length > 0) {
			console.log(
				`[worktree-sync] Started watching ${activeProjects.length} active project(s)`,
			);
		}
	}

	/**
	 * Debounce sync to avoid rapid-fire during batch worktree operations.
	 */
	private debouncedSync(projectId: string, mainRepoPath: string): void {
		const existing = this.debounceTimers.get(projectId);
		if (existing) {
			clearTimeout(existing);
		}

		const timer = setTimeout(() => {
			this.debounceTimers.delete(projectId);
			this.syncProject(projectId, mainRepoPath).catch((error) => {
				console.error(
					`[worktree-sync] Sync failed for project ${projectId}:`,
					error,
				);
			});
		}, WorktreeSyncService.DEBOUNCE_MS);

		this.debounceTimers.set(projectId, timer);
	}

	/**
	 * Sync worktrees for a single project: import new, remove stale.
	 */
	async syncProject(
		projectId: string,
		mainRepoPath?: string,
	): Promise<WorktreeSyncEvent> {
		if (this.syncInProgress.has(projectId)) {
			// Queue a re-sync so filesystem changes during an active sync aren't lost
			this.pendingResync.set(projectId, mainRepoPath);
			return { projectId, imported: 0, removed: 0 };
		}

		this.syncInProgress.add(projectId);

		let result: WorktreeSyncEvent = { projectId, imported: 0, removed: 0 };
		let syncError: unknown;
		try {
			result = await this.doSync(projectId, mainRepoPath);
		} catch (error) {
			syncError = error;
		} finally {
			this.syncInProgress.delete(projectId);
		}

		// Drain queued re-sync even after failure so filesystem changes aren't lost
		if (this.pendingResync.has(projectId)) {
			const pendingPath = this.pendingResync.get(projectId);
			this.pendingResync.delete(projectId);
			await this.syncProject(projectId, pendingPath);
		}

		if (syncError !== undefined) {
			throw syncError;
		}
		return result;
	}

	/**
	 * Core sync logic: compares on-disk worktrees against the local DB,
	 * removes stale entries and imports newly discovered worktrees.
	 */
	private async doSync(
		projectId: string,
		mainRepoPath?: string,
	): Promise<WorktreeSyncEvent> {
		const project = mainRepoPath
			? { id: projectId, mainRepoPath }
			: localDb.select().from(projects).where(eq(projects.id, projectId)).get();

		if (!project) {
			return { projectId, imported: 0, removed: 0 };
		}

		const fullProject = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();

		if (!fullProject) {
			return { projectId, imported: 0, removed: 0 };
		}

		let imported = 0;
		let removed = 0;

		// --- Phase 1: Remove stale worktrees (in DB but no longer on disk) ---
		const dbWorktrees = localDb
			.select()
			.from(worktrees)
			.where(eq(worktrees.projectId, projectId))
			.all();

		for (const wt of dbWorktrees) {
			const exists = await worktreeExists(fullProject.mainRepoPath, wt.path);
			if (!exists) {
				// Remove associated workspace(s) first
				const associatedWorkspaces = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.worktreeId, wt.id))
					.all();

				for (const ws of associatedWorkspaces) {
					updateActiveWorkspaceIfRemoved(ws.id);
					deleteWorkspace(ws.id);
				}

				deleteWorktreeRecord(wt.id);
				removed++;
			}
		}

		// --- Phase 2: Import new worktrees (on disk but not in DB) ---
		const allExternalWorktrees = await listExternalWorktrees(
			fullProject.mainRepoPath,
		);

		// Re-query tracked paths after removals
		const currentTracked = localDb
			.select({ path: worktrees.path })
			.from(worktrees)
			.where(eq(worktrees.projectId, projectId))
			.all();
		const trackedPaths = new Set(currentTracked.map((wt) => wt.path));

		const newWorktrees = allExternalWorktrees.filter((wt) => {
			if (wt.path === fullProject.mainRepoPath) return false;
			if (wt.isBare) return false;
			if (wt.isDetached) return false;
			if (!wt.branch) return false;
			if (trackedPaths.has(wt.path)) return false;
			return true;
		});

		if (newWorktrees.length > 0) {
			const baseBranch = resolveWorkspaceBaseBranch({
				workspaceBaseBranch: fullProject.workspaceBaseBranch,
				defaultBranch: fullProject.defaultBranch,
			});

			for (const ext of newWorktrees) {
				// biome-ignore lint/style/noNonNullAssertion: filtered above
				const branch = ext.branch!;

				const worktree = localDb
					.insert(worktrees)
					.values({
						projectId,
						path: ext.path,
						branch,
						baseBranch,
						gitStatus: {
							branch,
							needsRebase: false,
							ahead: 0,
							behind: 0,
							lastRefreshed: Date.now(),
						},
						createdBySuperset: false, // External worktree — never delete from disk
					})
					.returning()
					.get();

				const maxTabOrder = getMaxProjectChildTabOrder(projectId);
				localDb
					.insert(workspaces)
					.values({
						projectId,
						worktreeId: worktree.id,
						type: "worktree",
						branch,
						name: branch,
						isUnnamed: false,
						tabOrder: maxTabOrder + 1,
					})
					.run();

				imported++;

				// Best-effort post-import config — DB rows are already committed above
				try {
					await setBranchBaseConfig({
						repoPath: fullProject.mainRepoPath,
						branch,
						baseBranch,
						isExplicit: false,
					});
					copySupersetConfigToWorktree(fullProject.mainRepoPath, ext.path);
				} catch (error) {
					console.warn(
						`[worktree-sync] Post-import config failed for ${branch}:`,
						error,
					);
				}
			}
		}

		// --- Phase 3: Re-open closed worktrees (in DB, no active workspace, still on disk) ---
		// Skipped — closed worktrees are intentional state. The user can re-open them.

		if (imported > 0 || removed > 0) {
			if (imported > 0) {
				activateProject(fullProject);
			}
			hideProjectIfNoWorkspaces(projectId);

			const event: WorktreeSyncEvent = { projectId, imported, removed };
			this.emit("sync", event);

			track("worktrees_auto_synced", {
				project_id: projectId,
				imported,
				removed,
			});

			console.log(
				`[worktree-sync] Project ${projectId}: imported=${imported}, removed=${removed}`,
			);
		}

		return { projectId, imported, removed };
	}

	/**
	 * Sync all active projects and ensure watchers are running for each.
	 */
	async syncAllActiveProjects(): Promise<WorktreeSyncEvent[]> {
		const activeProjects = localDb
			.select({ id: projects.id, mainRepoPath: projects.mainRepoPath })
			.from(projects)
			.where(isNotNull(projects.tabOrder))
			.all();

		const results: WorktreeSyncEvent[] = [];
		for (const project of activeProjects) {
			// Ensure watcher is running (no-op if already watching)
			this.startWatching(project.id, project.mainRepoPath);

			const result = await this.syncProject(project.id, project.mainRepoPath);
			if (result.imported > 0 || result.removed > 0) {
				results.push(result);
			}
		}

		return results;
	}
}

/** Singleton worktree sync service instance */
export const worktreeSyncService = new WorktreeSyncService();
