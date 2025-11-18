import { randomUUID } from "node:crypto";
import type {
	WorkspaceOrchestrator as IWorkspaceOrchestrator,
	LocalWorkspace,
	Workspace,
	WorkspaceType,
} from "../../types/workspace";
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
		return workspace;
	}

	async list(environmentId?: string): Promise<Workspace[]> {
		const workspaces = await this.storage.getCollection("workspaces");
		const workspaceList = Object.values(workspaces);

		if (environmentId) {
			return workspaceList.filter((w) => w.environmentId === environmentId);
		}

		return workspaceList;
	}

	async create(
		environmentId: string,
		type: WorkspaceType,
		path?: string,
	): Promise<Workspace> {
		const workspace: Workspace | LocalWorkspace =
			type === "local" && path
				? ({
						id: randomUUID(),
						type,
						environmentId,
						path,
					} as LocalWorkspace)
				: {
						id: randomUUID(),
						type,
						environmentId,
					};

		await this.storage.set("workspaces", workspace.id, workspace);
		return workspace;
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
