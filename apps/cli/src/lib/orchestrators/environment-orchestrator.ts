import { randomUUID } from "node:crypto";
import type {
	Environment,
	EnvironmentOrchestrator as IEnvironmentOrchestrator,
} from "../../types/environment";
import type { StorageAdapter } from "../storage/adapter";

/**
 * Environment orchestrator implementation using storage adapter
 * Handles CRUD operations for environments
 */
export class EnvironmentOrchestrator implements IEnvironmentOrchestrator {
	constructor(private readonly storage: StorageAdapter) {}

	async get(id: string): Promise<Environment> {
		const environment = await this.storage.get("environments", id);
		if (!environment) {
			throw new Error(`Environment with id ${id} not found`);
		}
		return environment;
	}

	async list(): Promise<Environment[]> {
		const environments = await this.storage.getCollection("environments");
		return Object.values(environments);
	}

	async create(): Promise<Environment> {
		const environment: Environment = {
			id: randomUUID(),
		};

		await this.storage.set("environments", environment.id, environment);
		return environment;
	}

	async update(id: string, updates: Partial<Environment>): Promise<void> {
		const existing = await this.get(id);

		// Filter out immutable id field to prevent desync
		const { id: _, ...updatesWithoutImmutable } = updates;

		const updated = { ...existing, ...updatesWithoutImmutable };
		await this.storage.set("environments", id, updated);
	}

	async delete(id: string): Promise<void> {
		// Cascade delete: remove all workspaces, processes, changes, etc.
		const workspaces = await this.storage.getCollection("workspaces");
		const workspaceIds = Object.entries(workspaces)
			.filter(([_, workspace]) => workspace.environmentId === id)
			.map(([workspaceId]) => workspaceId);

		// Delete all child workspaces
		for (const workspaceId of workspaceIds) {
			await this.deleteWorkspaceCascade(workspaceId);
		}

		// Delete the environment itself
		await this.storage.delete("environments", id);
	}

	/**
	 * Helper to cascade delete workspace and its children
	 */
	private async deleteWorkspaceCascade(workspaceId: string): Promise<void> {
		// Delete all processes for this workspace
		const processes = await this.storage.getCollection("processes");
		const processIds = Object.entries(processes)
			.filter(([_, process]) => process.workspaceId === workspaceId)
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
			.filter(([_, change]) => change.workspaceId === workspaceId)
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
		await this.storage.delete("workspaces", workspaceId);
	}
}
