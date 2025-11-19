import { randomUUID } from "node:crypto";
import {
	type Agent,
	type AgentType,
	type ProcessOrchestrator as IProcessOrchestrator,
	type Process,
	ProcessType,
	type Terminal,
} from "../../types/process";
import type { Workspace } from "../../types/workspace";
import type { StorageAdapter } from "../storage/adapter";

/**
 * Process orchestrator implementation using storage adapter
 * Handles CRUD operations for processes (agents and terminals)
 */
export class ProcessOrchestrator implements IProcessOrchestrator {
	constructor(private readonly storage: StorageAdapter) {}

	async get(id: string): Promise<Process> {
		const process = await this.storage.get("processes", id);
		if (!process) {
			throw new Error(`Process with id ${id} not found`);
		}
		return process;
	}

	async list(workspaceId?: string): Promise<Process[]> {
		const processes = await this.storage.getCollection("processes");
		const processList = Object.values(processes);

		if (workspaceId) {
			return processList.filter((p) => p.workspaceId === workspaceId);
		}

		return processList;
	}

	async create(
		type: ProcessType,
		workspace: Workspace,
		agentType?: AgentType,
	): Promise<Process> {
		const now = new Date();
		const baseProcess = {
			id: randomUUID(),
			type,
			workspaceId: workspace.id,
			title: type === ProcessType.AGENT ? "Agent" : "Terminal",
			createdAt: now,
			updatedAt: now,
		};

		const process: Process | Agent | Terminal =
			type === ProcessType.AGENT && agentType
				? ({
						...baseProcess,
						agentType,
						status: "idle",
					} as Agent)
				: type === ProcessType.TERMINAL
					? (baseProcess as Terminal)
					: baseProcess;

		await this.storage.set("processes", process.id, process);
		return process;
	}

	async update(id: string, updates: Partial<Process>): Promise<void> {
		const existing = await this.get(id);

		// Filter out immutable fields to prevent desync
		const {
			id: _,
			workspaceId: __,
			createdAt: ___,
			...updatesWithoutImmutable
		} = updates;

		const updated = {
			...existing,
			...updatesWithoutImmutable,
			updatedAt: new Date(),
		};
		await this.storage.set("processes", id, updated);
	}

	async stop(id: string): Promise<void> {
		const existing = await this.get(id);
		const updated = {
			...existing,
			endedAt: new Date(),
			updatedAt: new Date(),
		};

		// Update status for agents
		if ("status" in updated) {
			(updated as Agent).status = "stopped";
		}

		await this.storage.set("processes", id, updated);
	}

	async stopAll(): Promise<void> {
		const processes = await this.storage.getCollection("processes");
		const now = new Date();

		for (const [id, process] of Object.entries(processes)) {
			if (!process.endedAt) {
				const updated = {
					...process,
					endedAt: now,
					updatedAt: now,
				};

				// Update status for agents
				if ("status" in updated) {
					(updated as Agent).status = "stopped";
				}

				await this.storage.set("processes", id, updated);
			}
		}
	}

	async delete(id: string): Promise<void> {
		// Cascade delete: remove all agent summaries for this process
		const agentSummaries = await this.storage.getCollection("agentSummaries");
		const summaryIds = Object.entries(agentSummaries)
			.filter(([_, summary]) => summary.agentId === id)
			.map(([summaryId]) => summaryId);

		for (const summaryId of summaryIds) {
			await this.storage.delete("agentSummaries", summaryId);
		}

		// Delete the process itself
		await this.storage.delete("processes", id);
	}
}
