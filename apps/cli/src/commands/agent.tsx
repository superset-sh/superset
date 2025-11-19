import { Box, Text } from "ink";
import React from "react";
import Table from "../components/Table";
import { getDb } from "../lib/db";
import { ProcessOrchestrator } from "../lib/orchestrators/process-orchestrator";
import { WorkspaceOrchestrator } from "../lib/orchestrators/workspace-orchestrator";
import type { AgentType, Process, ProcessType } from "../types/process";

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
	onComplete?: () => void;
}

export function AgentStopAll({ onComplete }: AgentStopAllProps) {
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [success, setSuccess] = React.useState(false);

	React.useEffect(() => {
		const stopAll = async () => {
			try {
				const db = getDb();
				const orchestrator = new ProcessOrchestrator(db);
				await orchestrator.stopAll();
				setSuccess(true);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
				onComplete?.();
			}
		};

		stopAll();
	}, [onComplete]);

	if (loading) {
		return <Text>Stopping all agents/processes...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (success) {
		return (
			<Text color="green">✓ All agents/processes stopped successfully</Text>
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
