import { randomUUID } from "node:crypto";
import type {
	WorkspaceOrchestrator as IWorkspaceOrchestrator,
	LocalWorkspace,
	Workspace,
} from "../../types/workspace";
import { WorkspaceType } from "../../types/workspace";
import type { StorageAdapter } from "../storage/adapter";

/**
 * Workspace orchestrator implementation using storage adapter
 * Handles CRUD operations for workspaces with cascade deletes
 */
export class WorkspaceOrchestrator implements IWorkspaceOrchestrator {
	constructor(private readonly storage: StorageAdapter) {}

	async get(id: string): Promise<Workspace> {
		const workspace = await this.storage.get("workspaces", id);
		if (!workspace) {
			throw new Error(`Workspace with id ${id} not found`);
		}

		const backfilled = this.backfillDefaults(workspace);

		// Persist backfilled defaults if they were added
		const needsPersist =
			!workspace.createdAt ||
			!workspace.updatedAt ||
			workspace.defaultAgents === undefined;

		if (needsPersist) {
			await this.storage.set("workspaces", id, backfilled);
		}

		return backfilled;
	}

	async list(environmentId?: string): Promise<Workspace[]> {
		const workspaces = await this.storage.getCollection("workspaces");
		const workspaceList = Object.values(workspaces).map((w) =>
			this.backfillDefaults(w),
		);

		if (environmentId) {
			return workspaceList.filter((w) => w.environmentId === environmentId);
		}

		return workspaceList;
	}

	async getCurrent(): Promise<Workspace | null> {
		const db = await this.storage.read();

		// Defensive: handle missing state object (old DB files)
		if (!db.state) {
			db.state = {};
			await this.storage.write(db);
			return null;
		}

		const currentId = db.state.currentWorkspaceId;

		if (!currentId) {
			return null;
		}

		try {
			return await this.get(currentId);
		} catch {
			// Current workspace was deleted, clear the pointer
			const newDb = await this.storage.read();
			if (!newDb.state) {
				newDb.state = {};
			}
			newDb.state.currentWorkspaceId = undefined;
			await this.storage.write(newDb);
			return null;
		}
	}

	private backfillDefaults(workspace: Workspace): Workspace {
		const now = new Date();
		return {
			...workspace,
			createdAt: workspace.createdAt || now,
			updatedAt: workspace.updatedAt || now,
			lastUsedAt: workspace.lastUsedAt,
			name: workspace.name,
			description: workspace.description,
			defaultAgents: workspace.defaultAgents || [],
		};
	}

	async create(
		environmentId: string,
		type: WorkspaceType,
		options?: {
			path?: string;
			branch?: string;
			name?: string;
			description?: string;
			defaultAgents?: string[];
		},
	): Promise<Workspace> {
		// Validate required fields based on type
		if (type === WorkspaceType.LOCAL && !options?.path) {
			throw new Error("Local workspace requires a path");
		}
		if (type === WorkspaceType.CLOUD && !options?.branch) {
			throw new Error("Cloud workspace requires a branch/ref");
		}

		const now = new Date();
		const baseWorkspace = {
			id: randomUUID(),
			type,
			environmentId,
			name: options?.name,
			description: options?.description,
			createdAt: now,
			updatedAt: now,
			defaultAgents: options?.defaultAgents || [],
		};

		let workspace: Workspace;
		if (type === WorkspaceType.LOCAL) {
			workspace = {
				...baseWorkspace,
				type: WorkspaceType.LOCAL,
				path: options!.path!,
			} as LocalWorkspace;
		} else if (type === WorkspaceType.CLOUD) {
			workspace = {
				...baseWorkspace,
				type: WorkspaceType.CLOUD,
				branch: options!.branch!,
			} as any; // CloudWorkspace
		} else {
			throw new Error(`Unknown workspace type: ${type}`);
		}

		await this.storage.set("workspaces", workspace.id, workspace);

		// Auto-select the newly created workspace
		await this.use(workspace.id);

		return workspace;
	}

	async use(id: string): Promise<void> {
		// Verify workspace exists
		await this.get(id);

		// Update lastUsedAt
		const workspace = await this.storage.get("workspaces", id);
		if (workspace) {
			workspace.lastUsedAt = new Date();
			workspace.updatedAt = new Date();
			await this.storage.set("workspaces", id, workspace);
		}

		// Set as current workspace
		const db = await this.storage.read();
		db.state.currentWorkspaceId = id;
		await this.storage.write(db);
	}

	async update(id: string, updates: Partial<Workspace>): Promise<void> {
		const existing = await this.get(id);

		// Filter out immutable fields to prevent desync
		const { id: _, environmentId: __, ...updatesWithoutImmutable } = updates;

		const updated = { ...existing, ...updatesWithoutImmutable };
		await this.storage.set("workspaces", id, updated);
	}

	async delete(id: string): Promise<void> {
		// Cascade delete: remove all processes and changes for this workspace

		// Delete all processes for this workspace
		const processes = await this.storage.getCollection("processes");
		const processIds = Object.entries(processes)
			.filter(([_, process]) => process.workspaceId === id)
			.map(([processId]) => processId);

		for (const processId of processIds) {
			// Delete agent summaries for this process
			const agentSummaries = await this.storage.getCollection("agentSummaries");
			const summaryIds = Object.entries(agentSummaries)
				.filter(([_, summary]) => summary.agentId === processId)
				.map(([summaryId]) => summaryId);

			for (const summaryId of summaryIds) {
				await this.storage.delete("agentSummaries", summaryId);
			}

			await this.storage.delete("processes", processId);
		}

		// Delete all changes for this workspace
		const changes = await this.storage.getCollection("changes");
		const changeIds = Object.entries(changes)
			.filter(([_, change]) => change.workspaceId === id)
			.map(([changeId]) => changeId);

		for (const changeId of changeIds) {
			// Delete file diffs for this change
			const fileDiffs = await this.storage.getCollection("fileDiffs");
			const diffIds = Object.entries(fileDiffs)
				.filter(([_, diff]) => diff.changeId === changeId)
				.map(([diffId]) => diffId);

			for (const diffId of diffIds) {
				await this.storage.delete("fileDiffs", diffId);
			}

			await this.storage.delete("changes", changeId);
		}

		// Delete the workspace itself
		await this.storage.delete("workspaces", id);
	}
}
