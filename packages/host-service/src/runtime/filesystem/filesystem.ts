import {
	createFsHostService,
	type FsHostService,
	FsWatcherManager,
	invalidateSearchIndexesForRoot,
	watchSingleFile,
} from "@superset/workspace-fs/host";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db/index.ts";
import { projects, workspaces } from "../../db/schema.ts";
import { listGitIgnoredDirs } from "../git/index.ts";
import { broadRootReason } from "./watch-root-policy.ts";

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
	private readonly shallowWatches = new Set<() => void>();
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
			const broad = broadRootReason(rootPath) !== null;
			service = createFsHostService({
				rootPath,
				// A broad root observes immediate children only. Expanded folders
				// and open documents acquire their own resource watches via the bus.
				watcherManager: broad
					? {
							subscribe: async ({ absolutePath }, listener) => {
								const dispose = watchSingleFile(absolutePath, (event) => {
									invalidateSearchIndexesForRoot(rootPath);
									listener({ events: [event] });
								});
								this.shallowWatches.add(dispose);
								return async () => {
									this.shallowWatches.delete(dispose);
									dispose();
								};
							},
							close: async () => {
								for (const dispose of this.shallowWatches) dispose();
								this.shallowWatches.clear();
							},
						}
					: this.watcherManager,
				// Descendants outside the visible tree have no recursive invalidation.
				searchIndexMaxAgeMs: broad ? 5_000 : undefined,
			});
			this.serviceCache.set(rootPath, service);
			// Opening a workspace must not walk it. Build an index only on search.
		}
		return service;
	}

	async close(): Promise<void> {
		for (const dispose of this.shallowWatches) dispose();
		this.shallowWatches.clear();
		for (const root of this.serviceCache.keys())
			invalidateSearchIndexesForRoot(root);
		this.serviceCache.clear();
		await this.watcherManager.close();
	}
}
