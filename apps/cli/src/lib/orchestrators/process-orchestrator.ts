import { randomUUID } from "node:crypto";
import {
	type Agent,
	type AgentType,
	type ProcessOrchestrator as IProcessOrchestrator,
	type Process,
	ProcessStatus,
	ProcessType,
	type Terminal,
} from "../../types/process";
import type { Workspace } from "../../types/workspace";
import { getDefaultLaunchCommand } from "../launch/config";
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

		const backfilled = this.backfillDefaults(process);

		// Persist backfilled defaults if they were added or updated
		if (this.needsPersist(process)) {
			await this.storage.set("processes", id, backfilled);
		}

		return backfilled;
	}

	async list(workspaceId?: string): Promise<Process[]> {
		const processes = await this.storage.getCollection("processes");
		const processList: Process[] = [];

		for (const [id, process] of Object.entries(processes)) {
			const backfilled = this.backfillDefaults(process);

			// Persist backfilled defaults if they were added or updated
			if (this.needsPersist(process)) {
				await this.storage.set("processes", id, backfilled);
			}

			processList.push(backfilled);
		}

		if (workspaceId) {
			return processList.filter((p) => p.workspaceId === workspaceId);
		}

		return processList;
	}

	private needsPersist(process: Process): boolean {
		return (
			!process.status ||
			!process.createdAt ||
			!process.updatedAt ||
			(process.type === ProcessType.AGENT &&
				"agentType" in process &&
				(!process.launchCommand ||
					(process.agentType === "claude" &&
						(process.launchCommand === "claude-code" ||
							process.launchCommand === "claude-code shell")) ||
					(process.agentType === "codex" && process.launchCommand === "code")))
		);
	}

	private backfillDefaults(process: Process): Process {
		const now = new Date();
		// Determine status based on endedAt
		const defaultStatus = process.endedAt
			? ProcessStatus.STOPPED
			: ProcessStatus.IDLE;

		const backfilled = {
			...process,
			status: process.status || defaultStatus,
			createdAt: process.createdAt || now,
			updatedAt: process.updatedAt || now,
		};

		// Backfill or update launchCommand for agents
		if (process.type === ProcessType.AGENT && "agentType" in process) {
			const agent = backfilled as Agent;
			const currentDefault = getDefaultLaunchCommand(agent.agentType);

			// Update if missing or outdated
			const isOutdated =
				!agent.launchCommand ||
				(agent.agentType === "claude" &&
					(agent.launchCommand === "claude-code" ||
						agent.launchCommand === "claude-code shell")) ||
				(agent.agentType === "codex" && agent.launchCommand === "code");

			if (isOutdated) {
				agent.launchCommand = currentDefault;
			}
		}

		return backfilled;
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
			status: ProcessStatus.IDLE,
			createdAt: now,
			updatedAt: now,
		};

		const process: Process | Agent | Terminal =
			type === ProcessType.AGENT && agentType
				? ({
						...baseProcess,
						agentType,
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
			(updated as Agent).status = ProcessStatus.STOPPED;
		}

		await this.storage.set("processes", id, updated);
	}

	async stopAll(): Promise<number> {
		const processes = await this.storage.getCollection("processes");
		const now = new Date();
		let stoppedCount = 0;

		for (const [id, process] of Object.entries(processes)) {
			// Only stop agents, not terminals
			if (process.type === ProcessType.AGENT && !process.endedAt) {
				const updated = {
					...process,
					endedAt: now,
					updatedAt: now,
				};

				// Update status for agents
				if ("status" in updated) {
					(updated as Agent).status = ProcessStatus.STOPPED;
				}

				await this.storage.set("processes", id, updated);
				stoppedCount++;
			}
		}

		return stoppedCount;
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
