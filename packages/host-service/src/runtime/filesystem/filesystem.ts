import {
	createFsHostService,
	type FsHostService,
	FsWatcherManager,
} from "@superset/workspace-fs/host";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { projects, workspaces } from "../../db/schema.ts";
import { listGitIgnoredDirs } from "../git/index.ts";
import { WatchAttachGuard } from "./watch-attach-guard.ts";

export interface WorkspaceFilesystemManagerOptions {
	db: HostDb;
}

export class WorkspaceNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "WorkspaceNotFoundError";
	}
}

export class ProjectNotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ProjectNotFoundError";
	}
}

export class WorkspaceFilesystemManager {
	private readonly db: HostDb;
	private readonly watcherManager = new FsWatcherManager({
		listGitIgnoredDirs,
		useDefaultIgnores: false,
	});
	private readonly watchAttachGuard = new WatchAttachGuard(this.watcherManager);
	private readonly serviceCache = new Map<string, FsHostService>();

	constructor(options: WorkspaceFilesystemManagerOptions) {
		this.db = options.db;
	}

	resolveWorkspaceRoot(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();

		if (!workspace) {
			throw new WorkspaceNotFoundError(`Workspace not found: ${workspaceId}`);
		}

		return workspace.rootPath ?? workspace.worktreePath;
	}

	resolveWorkspacePrimaryWorktree(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();

		if (!workspace) {
			throw new WorkspaceNotFoundError(`Workspace not found: ${workspaceId}`);
		}

		return workspace.worktreePath;
	}

	getServiceForPrimaryWorktree(workspaceId: string): FsHostService {
		return this.getServiceForRootPath(
			this.resolveWorkspacePrimaryWorktree(workspaceId),
		);
	}

	resolveProjectRoot(projectId: string): string {
		const project = this.db.query.projects
			.findFirst({ where: eq(projects.id, projectId) })
			.sync();

		if (!project) {
			throw new ProjectNotFoundError(`Project not found: ${projectId}`);
		}

		return project.repoPath;
	}

	getServiceForWorkspace(workspaceId: string): FsHostService {
		return this.getServiceForRootPath(this.resolveWorkspaceRoot(workspaceId));
	}

	getServiceForProject(projectId: string): FsHostService {
		return this.getServiceForRootPath(this.resolveProjectRoot(projectId));
	}

	/**
	 * Whether the workspace's recursive watcher delivers no events for this
	 * path (pruned subtree, outside the root, or no watcher attached). Callers
	 * use it to decide whether an open file needs its own targeted watch.
	 */
	isPathPrunedFromWatch(workspaceId: string, absolutePath: string): boolean {
		return this.watcherManager.isPathPruned(
			this.resolveWorkspaceRoot(workspaceId),
			absolutePath,
		);
	}

	isWatchAttachBackingOff(rootPath: string): boolean {
		return this.watchAttachGuard.isBackingOff(rootPath);
	}

	/**
	 * Swap the workspace's native subscription onto a freshly derived ignore
	 * set. Required after a directory is UN-ignored — the attach-time prune
	 * would otherwise suppress its events until restart. Returns whether the
	 * subscription was actually swapped.
	 */
	async refreshWatcherIgnores(workspaceId: string): Promise<boolean> {
		return await this.watcherManager.refreshIgnores(
			this.resolveWorkspaceRoot(workspaceId),
		);
	}

	/**
	 * The two above, addressed by checkout rather than by workspace: a
	 * multi-repo workspace watches each of its checkouts, and `watchPath`
	 * takes only a service's own root.
	 */
	getServiceForCheckout(worktreePath: string): FsHostService {
		return this.getServiceForRootPath(worktreePath);
	}

	async refreshCheckoutWatcherIgnores(worktreePath: string): Promise<boolean> {
		return await this.watcherManager.refreshIgnores(worktreePath);
	}

	private getServiceForRootPath(rootPath: string): FsHostService {
		let service = this.serviceCache.get(rootPath);
		if (!service) {
			service = createFsHostService({
				rootPath,
				watcherManager: this.watchAttachGuard,
			});
			this.serviceCache.set(rootPath, service);
		}
		return service;
	}

	async close(): Promise<void> {
		this.serviceCache.clear();
		await this.watchAttachGuard.close();
	}
}
