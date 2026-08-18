import {
	createFsHostService,
	type FsHostService,
	FsWatcherManager,
	getSearchIndex,
} from "@superset/workspace-fs/host";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { projects, workspaces } from "../../db/schema.ts";
import { listGitIgnoredDirs } from "../git/index.ts";

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
	});
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

		return workspace.worktreePath;
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

	private getServiceForRootPath(rootPath: string): FsHostService {
		let service = this.serviceCache.get(rootPath);
		if (!service) {
			service = createFsHostService({
				rootPath,
				watcherManager: this.watcherManager,
			});
			this.serviceCache.set(rootPath, service);
			// Pre-warm search index so first search is instant
			getSearchIndex({ rootPath, includeHidden: false }).catch(() => {});
		}
		return service;
	}

	async close(): Promise<void> {
		this.serviceCache.clear();
		await this.watcherManager.close();
	}
}
