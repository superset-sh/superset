import {
	createFsHostService,
	type FsHostService,
	FsWatcherManager,
} from "@superset/workspace-fs/host";
import { eq } from "drizzle-orm";
import type { HostDb } from "../../db";
import { workspaces } from "../../db/schema";

export interface WorkspaceFilesystemManagerOptions {
	db: HostDb;
}

export class WorkspaceFilesystemManager {
	private readonly db: HostDb;
	private readonly watcherManager = new FsWatcherManager();
	private readonly serviceCache = new Map<string, FsHostService>();

	constructor(options: WorkspaceFilesystemManagerOptions) {
		this.db = options.db;
	}

	resolveWorkspaceRoot(workspaceId: string): string {
		const workspace = this.db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();

		if (!workspace) {
			throw new Error(`Workspace not found: ${workspaceId}`);
		}

		return workspace.worktreePath;
	}

	getServiceForWorkspace(workspaceId: string): FsHostService {
		const rootPath = this.resolveWorkspaceRoot(workspaceId);
		let service = this.serviceCache.get(rootPath);
		if (!service) {
			service = createFsHostService({
				rootPath,
				watcherManager: this.watcherManager,
			});
			this.serviceCache.set(rootPath, service);
		}
		return service;
	}

	async close(): Promise<void> {
		this.serviceCache.clear();
		await this.watcherManager.close();
	}
}
