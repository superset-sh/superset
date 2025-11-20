import { exec, execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
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

const execAsync = promisify(exec);

/**
 * Check if tmux is installed
 */
function isTmuxInstalled(): boolean {
	try {
		execSync("which tmux", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a tmux session exists (synchronous to avoid promise hangs)
 */
function tmuxSessionExists(sessionName: string): boolean {
	if (!isTmuxInstalled()) {
		return false;
	}
	try {
		execSync(`tmux has-session -t "${sessionName}" 2>/dev/null`, { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

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

		// Sync agent status with tmux session reality
		let needsSync = false;
		if (backfilled.type === ProcessType.AGENT && "sessionName" in backfilled) {
			needsSync = this.syncAgentStatus(backfilled as Agent);
		}

		// Persist backfilled defaults or status sync if needed
		if (this.needsPersist(process) || needsSync) {
			await this.storage.set("processes", id, backfilled);
		}

		return backfilled;
	}

	async list(workspaceId?: string): Promise<Process[]> {
		const processes = await this.storage.getCollection("processes");
		const processList: Process[] = [];

		for (const [id, process] of Object.entries(processes)) {
			const backfilled = this.backfillDefaults(process);

			// Sync agent status with tmux session reality
			let needsSync = false;
			if (backfilled.type === ProcessType.AGENT && "sessionName" in backfilled) {
				needsSync = this.syncAgentStatus(backfilled as Agent);
			}

			// Persist backfilled defaults or status sync if needed
			if (this.needsPersist(process) || needsSync) {
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
					!("sessionName" in process) ||
					!(process as Agent).sessionName ||
					(process.agentType === "claude" &&
						(process.launchCommand === "claude-code" ||
							process.launchCommand === "claude-code shell")) ||
					(process.agentType === "codex" && process.launchCommand === "code")))
		);
	}

	/**
	 * Sync agent status with tmux session reality
	 * Returns true if status was changed and needs persisting
	 */
	private syncAgentStatus(agent: Agent): boolean {
		if (!agent.sessionName) {
			return false;
		}

		const sessionExists = tmuxSessionExists(agent.sessionName);

		// If session doesn't exist but agent is not already STOPPED, mark it STOPPED
		if (!sessionExists && agent.status !== ProcessStatus.STOPPED) {
			agent.status = ProcessStatus.STOPPED;
			agent.endedAt = new Date();
			agent.updatedAt = new Date();
			return true;
		}

		// If session exists and agent is not RUNNING, upgrade to RUNNING
		// This handles IDLE → RUNNING and revival of STOPPED agents
		// Clear endedAt when reviving to indicate the agent is active again
		if (sessionExists && agent.status !== ProcessStatus.RUNNING) {
			agent.status = ProcessStatus.RUNNING;
			agent.endedAt = undefined; // Clear endedAt when session is alive
			agent.updatedAt = new Date();
			return true;
		}

		return false;
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

		// Backfill or update launchCommand and sessionName for agents
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

			// Backfill sessionName if missing
			if (!agent.sessionName) {
				agent.sessionName = `agent-${agent.id.slice(0, 6)}`;
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
		const id = randomUUID();
		const baseProcess = {
			id,
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
						sessionName: `agent-${id.slice(0, 6)}`,
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

		// Kill tmux session if it's an agent with a sessionName
		if (existing.type === ProcessType.AGENT && "sessionName" in existing) {
			const agent = existing as Agent;
			if (agent.sessionName) {
				try {
					await execAsync(`tmux kill-session -t "${agent.sessionName}" 2>/dev/null`);
				} catch {
					// Ignore errors (session might already be dead)
				}
			}
		}

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

	/**
	 * Stop all running agents (does not affect terminals)
	 * Kills their tmux sessions and marks them as STOPPED
	 * @returns The number of agents stopped
	 */
	async stopAll(): Promise<number> {
		const processes = await this.storage.getCollection("processes");
		const now = new Date();
		let stoppedCount = 0;

		for (const [id, process] of Object.entries(processes)) {
			// Only stop agents, not terminals
			if (process.type === ProcessType.AGENT && !process.endedAt) {
				// Kill tmux session if agent has sessionName
				if ("sessionName" in process) {
					const agent = process as Agent;
					if (agent.sessionName) {
						try {
							await execAsync(`tmux kill-session -t "${agent.sessionName}" 2>/dev/null`);
						} catch {
							// Ignore errors (session might already be dead)
						}
					}
				}

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
