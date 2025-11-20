import { Box, Text, useApp } from "ink";
import SelectInput from "ink-select-input";
import React from "react";
import Table from "../components/Table";
import { getDb } from "../lib/db";
import { getDefaultLaunchCommand } from "../lib/launch/config";
import { ProcessOrchestrator } from "../lib/orchestrators/process-orchestrator";
import { WorkspaceOrchestrator } from "../lib/orchestrators/workspace-orchestrator";
import {
	AgentType,
	type Process,
	ProcessStatus,
	ProcessType,
} from "../types/process";

// Display type with formatted date strings
type FormattedProcess = Omit<Process, "createdAt" | "updatedAt" | "endedAt"> & {
	createdAt: string;
	updatedAt: string;
	endedAt: string;
};

interface AgentListProps {
	workspaceId?: string;
	onComplete?: () => void;
}

export function AgentList({ workspaceId, onComplete }: AgentListProps) {
	const [agents, setAgents] = React.useState<FormattedProcess[]>([]);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadAgents = async () => {
			try {
				const db = getDb();
				const orchestrator = new ProcessOrchestrator(db);
				const processes = await orchestrator.list(workspaceId);

				if (processes.length === 0) {
					setAgents([]);
				} else {
					// Format dates for display
					const formatted = processes.map((p) => ({
						...p,
						createdAt: new Date(p.createdAt).toLocaleString(),
						updatedAt: new Date(p.updatedAt).toLocaleString(),
						endedAt: p.endedAt ? new Date(p.endedAt).toLocaleString() : "—",
					}));
					setAgents(formatted);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadAgents();
	}, [workspaceId, onComplete]);

	if (loading) {
		return <Text>Loading agents/processes...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (agents.length === 0) {
		const message = workspaceId
			? `No agents/processes found for workspace ${workspaceId}`
			: "No agents/processes found";
		return (
			<Text dimColor>
				{message}. Create one with: superset agent create &lt;workspace-id&gt;
				&lt;type&gt;
			</Text>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>
				Agents/Processes{workspaceId ? ` (Workspace: ${workspaceId})` : ""}
			</Text>
			<Table data={agents} />
		</Box>
	);
}

interface AgentGetProps {
	id: string;
	onComplete?: () => void;
}

export function AgentGet({ id, onComplete }: AgentGetProps) {
	const [agent, setAgent] = React.useState<FormattedProcess | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const loadAgent = async () => {
			try {
				const db = getDb();
				const orchestrator = new ProcessOrchestrator(db);
				const process = await orchestrator.get(id);

				// Format dates
				const formatted = {
					...process,
					createdAt: new Date(process.createdAt).toLocaleString(),
					updatedAt: new Date(process.updatedAt).toLocaleString(),
					endedAt: process.endedAt
						? new Date(process.endedAt).toLocaleString()
						: "—",
				};

				setAgent(formatted);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		loadAgent();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Loading agent/process...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (!agent) {
		return <Text color="red">Error: Agent not found</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text bold>Agent/Process Details</Text>
			<Table data={[agent]} />
		</Box>
	);
}

interface AgentCreateProps {
	workspaceId: string;
	type: ProcessType;
	agentType?: AgentType;
	onComplete?: () => void;
}

export function AgentCreate({
	workspaceId,
	type,
	agentType,
	onComplete,
}: AgentCreateProps) {
	const [agent, setAgent] = React.useState<FormattedProcess | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const createAgent = async () => {
			try {
				const db = getDb();
				const workspaceOrchestrator = new WorkspaceOrchestrator(db);
				const processOrchestrator = new ProcessOrchestrator(db);

				// Get workspace to pass to create
				const workspace = await workspaceOrchestrator.get(workspaceId);

				// Create the process
				const process = await processOrchestrator.create(
					type,
					workspace,
					agentType,
				);

				// Format dates
				const formatted = {
					...process,
					createdAt: new Date(process.createdAt).toLocaleString(),
					updatedAt: new Date(process.updatedAt).toLocaleString(),
					endedAt: process.endedAt
						? new Date(process.endedAt).toLocaleString()
						: "—",
				};

				setAgent(formatted);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		createAgent();
	}, [workspaceId, type, agentType, onComplete]);

	if (loading) {
		return <Text>Creating agent/process...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (!agent) {
		return <Text color="red">Error: Failed to create agent</Text>;
	}

	return (
		<Box flexDirection="column">
			<Text color="green">✓ Agent/Process created successfully</Text>
			<Table data={[agent]} />
		</Box>
	);
}

interface AgentStopProps {
	id: string;
	onComplete?: () => void;
}

export function AgentStop({ id, onComplete }: AgentStopProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);

	React.useEffect(() => {
		const stopAgent = async () => {
			try {
				const db = getDb();
				const orchestrator = new ProcessOrchestrator(db);
				await orchestrator.stop(id);
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		stopAgent();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Stopping agent/process...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Agent/Process stopped successfully</Text>
				<Text dimColor>ID: {id}</Text>
			</Box>
		);
	}

	return null;
}

interface AgentStopAllProps {
	workspaceId?: string;
	onComplete?: () => void;
}

export function AgentStopAll({ workspaceId, onComplete }: AgentStopAllProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);
	const [stoppedCount, setStoppedCount] = React.useState(0);

	React.useEffect(() => {
		const stopAll = async () => {
			try {
				const db = getDb();
				const processOrchestrator = new ProcessOrchestrator(db);
				const workspaceOrchestrator = new WorkspaceOrchestrator(db);

				// Determine which workspace to use
				let targetWorkspaceId = workspaceId;
				if (!targetWorkspaceId) {
					const currentWorkspace = await workspaceOrchestrator.getCurrent();
					if (!currentWorkspace) {
						setError(
							"No current workspace set. Specify --workspace or run 'superset workspace use <id>'",
						);
						setLoading(false);
						return;
					}
					targetWorkspaceId = currentWorkspace.id;
				}

				// Get all AGENT processes for the workspace (not terminals)
				const processes = await processOrchestrator.list(targetWorkspaceId);
				const runningAgents = processes.filter(
					(p) => !p.endedAt && p.type === ProcessType.AGENT,
				);

				// Stop each agent
				let count = 0;
				for (const agent of runningAgents) {
					await processOrchestrator.stop(agent.id);
					count++;
				}

				// Provide feedback if nothing was stopped
				if (count === 0) {
					setError(
						`No running agents found in workspace ${targetWorkspaceId.slice(0, 8)}`,
					);
					setLoading(false);
					return;
				}

				setStoppedCount(count);
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		stopAll();
	}, [workspaceId, onComplete]);

	if (loading) {
		return <Text>Stopping all agents...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">
					✓ Stopped {stoppedCount} agent(s)/process(es) successfully
				</Text>
				{workspaceId && (
					<Text dimColor>Workspace: {workspaceId.slice(0, 8)}...</Text>
				)}
			</Box>
		);
	}

	return null;
}

interface AgentDeleteProps {
	id: string;
	onComplete?: () => void;
}

export function AgentDelete({ id, onComplete }: AgentDeleteProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);

	React.useEffect(() => {
		const deleteAgent = async () => {
			try {
				const db = getDb();
				const orchestrator = new ProcessOrchestrator(db);
				await orchestrator.delete(id);
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		deleteAgent();
	}, [id, onComplete]);

	if (loading) {
		return <Text>Deleting agent/process...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Box flexDirection="column">
				<Text color="green">✓ Agent/Process deleted successfully</Text>
				<Text dimColor>ID: {id}</Text>
				<Text dimColor>
					Note: All associated agent summaries have been removed.
				</Text>
			</Box>
		);
	}

	return null;
}

enum StartStep {
	LOADING = "LOADING",
	SELECT_AGENTS = "SELECT_AGENTS",
	STARTING = "STARTING",
	COMPLETE = "COMPLETE",
}

interface AgentStartProps {
	workspaceId?: string;
	onComplete?: () => void;
}

export function AgentStart({ workspaceId, onComplete }: AgentStartProps) {
	const { exit } = useApp();
	const [step, setStep] = React.useState(StartStep.LOADING);
	const [error, setError] = React.useState<string | null>(null);
	const [workspace, setWorkspace] = React.useState<any>(null);
	const [selectedAgents, setSelectedAgents] = React.useState<AgentType[]>([]);
	const [startedAgents, setStartedAgents] = React.useState<Process[]>([]);
	const [failures, setFailures] = React.useState<
		Array<{ agentType: AgentType; error: string }>
	>([]);

	React.useEffect(() => {
		const loadWorkspace = async () => {
			try {
				const db = getDb();
				const workspaceOrchestrator = new WorkspaceOrchestrator(db);

				let ws;
				if (workspaceId) {
					ws = await workspaceOrchestrator.get(workspaceId);
				} else {
					ws = await workspaceOrchestrator.getCurrent();
					if (!ws) {
						setError(
							"No current workspace set. Run 'superset init' or 'superset workspace use <id>' first.",
						);
						return;
					}
				}

				setWorkspace(ws);

				// If workspace has default agents, use them automatically
				if (ws.defaultAgents && ws.defaultAgents.length > 0) {
					setSelectedAgents(ws.defaultAgents as AgentType[]);
					setStep(StartStep.STARTING);
					startAgents(ws, ws.defaultAgents as AgentType[]);
				} else {
					// No defaults, prompt user to select
					setStep(StartStep.SELECT_AGENTS);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			}
		};

		loadWorkspace();
	}, [workspaceId]);

	const startAgents = async (ws: any, agents: AgentType[]) => {
		try {
			const db = getDb();
			const processOrchestrator = new ProcessOrchestrator(db);
			const workspaceOrchestrator = new WorkspaceOrchestrator(db);

			const created: Process[] = [];
			const failures: Array<{ agentType: AgentType; error: string }> = [];

			for (const agentType of agents) {
				// Get default launch command for this agent type
				const launchCommand = getDefaultLaunchCommand(agentType);

				// Create the process in IDLE state
				const process = await processOrchestrator.create(
					ProcessType.AGENT,
					ws,
					agentType,
				);

				// Set launch command but keep in IDLE state
				await processOrchestrator.update(process.id, {
					launchCommand,
				});

				// Actually create the tmux session in the background
				const agent = process as import("../types/process").Agent;
				const { launchAgent } = await import("../lib/launch/run");
				const result = await launchAgent(agent, { attach: false });

				if (!result.success) {
					// If session creation fails, mark agent as ERROR
					await processOrchestrator.update(process.id, {
						status: ProcessStatus.ERROR,
						endedAt: new Date(),
					});
					failures.push({
						agentType,
						error: result.error || "Unknown error",
					});
				} else {
					// Only mark as RUNNING if session creation succeeded
					await processOrchestrator.update(process.id, {
						status: ProcessStatus.RUNNING,
						endedAt: undefined, // Clear endedAt since session is alive
					});
					created.push(process);
				}
			}

			// Update workspace lastUsedAt and set as current if not already
			await workspaceOrchestrator.use(ws.id);

			setStartedAgents(created);
			setFailures(failures);

			// Only advance to COMPLETE if at least one agent succeeded
			if (created.length > 0) {
				setStep(StartStep.COMPLETE);

				// Auto-exit after showing success (skip if there were partial failures)
				if (failures.length === 0) {
					setTimeout(() => {
						exit();
					}, 2000);
				}
			} else {
				// All agents failed - show error
				const errorMsg = failures
					.map((f) => `${f.agentType}: ${f.error}`)
					.join("\n");
				setError(
					`Failed to start all agents:\n${errorMsg}\n\nPlease check that tmux is installed and the agent commands are available.`,
				);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		}
	};

	const handleAgentSelect = (item: { value: string }) => {
		if (item.value === "done") {
			if (selectedAgents.length === 0) {
				setError("Please select at least one agent to start");
				return;
			}
			setStep(StartStep.STARTING);
			startAgents(workspace, selectedAgents);
		} else if (item.value === "cancel") {
			exit();
		} else {
			// Toggle agent selection
			setSelectedAgents((current) =>
				current.includes(item.value as AgentType)
					? current.filter((a) => a !== item.value)
					: [...current, item.value as AgentType],
			);
		}
	};

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (step === StartStep.LOADING) {
		return <Text>Loading workspace...</Text>;
	}

	if (step === StartStep.SELECT_AGENTS) {
		const agentItems = [
			...Object.values(AgentType).map((type) => ({
				label: `${selectedAgents.includes(type) ? "✓" : "○"} ${type}`,
				value: type,
			})),
			{ label: "→ Start selected agents", value: "done" },
			{ label: "→ Cancel", value: "cancel" },
		];

		return (
			<Box flexDirection="column">
				<Text bold color="cyan">
					Start Agents
				</Text>
				<Box marginTop={1}>
					<Text>Workspace: {workspace?.name || workspace?.id}</Text>
				</Box>
				<Box marginTop={1}>
					<Text>
						Select which agents to start (use arrow keys, Enter to toggle):
					</Text>
				</Box>
				{selectedAgents.length > 0 && (
					<Box marginTop={1}>
						<Text color="green">Selected: {selectedAgents.join(", ")}</Text>
					</Box>
				)}
				<Box marginTop={1}>
					<SelectInput items={agentItems} onSelect={handleAgentSelect} />
				</Box>
			</Box>
		);
	}

	if (step === StartStep.STARTING) {
		return (
			<Box flexDirection="column">
				<Text>Starting {selectedAgents.length} agent(s)...</Text>
			</Box>
		);
	}

	if (step === StartStep.COMPLETE) {
		const totalAttempted = selectedAgents.length;
		const successCount = startedAgents.length;
		const failureCount = failures.length;

		return (
			<Box flexDirection="column">
				<Text color={failureCount > 0 ? "yellow" : "green"}>
					{failureCount > 0 ? "⚠" : "✓"} Started {successCount}/{totalAttempted}{" "}
					agent(s) successfully
					{failureCount > 0 ? ` (${failureCount} failed)` : "!"}
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Workspace: {workspace?.name || workspace?.id}</Text>
					{successCount > 0 && (
						<Text dimColor color="green">
							Success: {startedAgents.map((a) => (a as any).agentType).join(", ")}
						</Text>
					)}
				</Box>
				{failureCount > 0 && (
					<Box marginTop={1} flexDirection="column">
						<Text color="red">Failed agents:</Text>
						{failures.map((f, i) => (
							<Text key={i} dimColor color="red">
								• {f.agentType}: {f.error}
							</Text>
						))}
					</Box>
				)}
				<Box marginTop={1}>
					<Text dimColor>
						Run <Text bold>superset dashboard</Text> to view agent status
					</Text>
				</Box>
				{failureCount > 0 && (
					<Box marginTop={1}>
						<Text dimColor>Press Ctrl+C to exit</Text>
					</Box>
				)}
			</Box>
		);
	}

	return null;
}

interface AgentAttachProps {
	id: string;
	onComplete?: () => void;
}

export function AgentAttach({ id, onComplete: _onComplete }: AgentAttachProps) {
	const { exit } = useApp();
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		const attachToSession = async () => {
			try {
				const db = getDb();
				const orchestrator = new ProcessOrchestrator(db);

				// Try to get by ID first
				let process;
				try {
					process = await orchestrator.get(id);
				} catch {
					// If not found by ID, try to find by sessionName
					const allProcesses = await orchestrator.list();
					const foundBySession = allProcesses.find(
						(p) =>
							p.type === ProcessType.AGENT &&
							"sessionName" in p &&
							(p as import("../types/process").Agent).sessionName === id,
					);

					if (!foundBySession) {
						setError(
							`Agent not found. Use the full agent ID or sessionName.\nRun 'superset agent list' to see available agents.`,
						);
						setLoading(false);
						return;
					}

					process = foundBySession;
				}

				// Ensure it's an agent
				if (process.type !== ProcessType.AGENT) {
					setError("Cannot attach: process is not an agent");
					setLoading(false);
					return;
				}

				const agent = process as import("../types/process").Agent;

				// Import and call launchAgent
				const { launchAgent } = await import("../lib/launch/run");

				// Exit Ink to stop useInput before tmux takes over stdin
				exit();
				setImmediate(async () => {
					const result = await launchAgent(agent, { attach: true });

					if (!result.success) {
						// Update agent status to STOPPED on failure
						try {
							const db = (await import("../lib/db")).getDb();
							const { ProcessOrchestrator } = await import(
								"../lib/orchestrators/process-orchestrator"
							);
							const orchestrator = new ProcessOrchestrator(db);
							await orchestrator.update(agent.id, {
								status: ProcessStatus.STOPPED,
								endedAt: new Date(),
							});
						} catch (dbError) {
							console.error(
								`\nWarning: Failed to update agent status: ${dbError instanceof Error ? dbError.message : String(dbError)}\n`,
							);
						}

						console.error(`\n❌ Failed to attach to agent\n`);
						console.error(`Error: ${result.error}\n`);
						if (result.exitCode !== undefined) {
							console.error(`Exit code: ${result.exitCode}\n`);
						}
						globalThis.process.exit(1);
					}

					globalThis.process.exit(0);
				});
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
				setLoading(false);
			}
		};

		attachToSession();
	}, [id, exit]);

	if (loading && !error) {
		return <Text>Preparing to attach...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	return null;
}
