import { Box, Text, useApp, useInput, useStdout } from "ink";
import React from "react";
import { getDb } from "../lib/db";
import { launchAgent } from "../lib/launch/run";
import { ProcessOrchestrator } from "../lib/orchestrators/process-orchestrator";
import { WorkspaceOrchestrator } from "../lib/orchestrators/workspace-orchestrator";
import {
	type Agent,
	type Process,
	ProcessStatus,
	ProcessType,
} from "../types/process";
import type { Workspace } from "../types/workspace";

interface DashboardData {
	workspaces: Workspace[];
	processes: Process[];
	currentWorkspaceId?: string;
	lastRefresh: Date;
}

interface DashboardProps {
	onComplete?: () => void;
}

type SelectionMode = "workspace" | "agent";

export function Dashboard({ onComplete: _onComplete }: DashboardProps) {
	const [data, setData] = React.useState<DashboardData | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = React.useState(0);
	const [selectedAgentIndex, setSelectedAgentIndex] = React.useState(0);
	const [selectionMode, setSelectionMode] =
		React.useState<SelectionMode>("workspace");
	const [filterByCurrent, setFilterByCurrent] = React.useState(false);
	const { exit } = useApp();
	const { stdout } = useStdout();

	// Get terminal width, default to 80 if not available
	const terminalWidth = stdout?.columns || 80;

	// Helper to create responsive separator
	const getSeparator = (width: number) => "─".repeat(Math.max(width - 4, 20));

	// Helper to truncate text if needed
	const truncate = (text: string, maxLength: number) => {
		if (text.length <= maxLength) return text;
		return `${text.slice(0, maxLength - 3)}...`;
	};

	const loadDashboard = React.useCallback(async () => {
		try {
			const db = getDb();
			const workspaceOrchestrator = new WorkspaceOrchestrator(db);
			const processOrchestrator = new ProcessOrchestrator(db);

			// Fetch all data in parallel
			const [workspaces, processes, currentWorkspace] = await Promise.all([
				workspaceOrchestrator.list(),
				processOrchestrator.list(),
				workspaceOrchestrator.getCurrent(),
			]);

			setData({
				workspaces,
				processes,
				currentWorkspaceId: currentWorkspace?.id,
				lastRefresh: new Date(),
			});

			setLoading(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setLoading(false);
		}
	}, []);

	// Initial load
	React.useEffect(() => {
		loadDashboard();
	}, [loadDashboard]);

	// Auto-refresh every 3 seconds
	React.useEffect(() => {
		const interval = setInterval(() => {
			loadDashboard();
		}, 3000);

		return () => clearInterval(interval);
	}, [loadDashboard]);

	// Keyboard shortcuts
	useInput((input, key) => {
		if (!data) return;

		// Exit
		if (key.escape || input === "q" || (key.ctrl && input === "c")) {
			exit();
			return;
		}

		// Get current list based on selection mode
		const agents = data.processes.filter((p) => p.type === ProcessType.AGENT);
		const selectedWorkspace = data.workspaces[selectedWorkspaceIndex];
		const displayWorkspaceId = filterByCurrent
			? data.currentWorkspaceId
			: selectedWorkspace?.id;
		const filteredAgents = displayWorkspaceId
			? agents.filter((a) => a.workspaceId === displayWorkspaceId)
			: agents;

		// Switch selection mode
		if (key.tab) {
			setSelectionMode((prev) =>
				prev === "workspace" ? "agent" : "workspace",
			);
			return;
		}

		// Navigation
		if (key.upArrow || input === "k") {
			if (selectionMode === "workspace") {
				setSelectedWorkspaceIndex((prev) =>
					prev > 0 ? prev - 1 : data.workspaces.length - 1,
				);
			} else {
				setSelectedAgentIndex((prev) =>
					prev > 0 ? prev - 1 : filteredAgents.length - 1,
				);
			}
		} else if (key.downArrow || input === "j") {
			if (selectionMode === "workspace") {
				setSelectedWorkspaceIndex((prev) =>
					prev < data.workspaces.length - 1 ? prev + 1 : 0,
				);
			} else {
				setSelectedAgentIndex((prev) =>
					prev < filteredAgents.length - 1 ? prev + 1 : 0,
				);
			}
		}

		// Actions
		else if (key.return) {
			// Launch selected agent
			if (selectionMode === "agent" && filteredAgents[selectedAgentIndex]) {
				const selectedAgent = filteredAgents[selectedAgentIndex];

				// Only launch agents, not terminals
				if (selectedAgent.type !== ProcessType.AGENT) {
					return;
				}

				const agentToLaunch = selectedAgent as Agent;
				// Exit Ink to stop useInput before tmux takes over stdin
				exit();
				setImmediate(async () => {
					const result = await launchAgent(agentToLaunch, { attach: true });

					if (!result.success) {
						// Update agent status to STOPPED on failure
						try {
							const db = getDb();
							const orchestrator = new ProcessOrchestrator(db);
							await orchestrator.update(agentToLaunch.id, {
								status: ProcessStatus.STOPPED,
								endedAt: new Date(),
							});
						} catch (dbError) {
							// Log DB error but don't fail the process
							console.error(
								`\nWarning: Failed to update agent status: ${dbError instanceof Error ? dbError.message : String(dbError)}\n`,
							);
						}

						console.error(
							`\n❌ Failed to attach to ${agentToLaunch.agentType} agent\n`,
						);
						console.error(`Error: ${result.error}\n`);
						if (result.exitCode !== undefined) {
							console.error(`Exit code: ${result.exitCode}\n`);
						}
						process.exit(1);
					}
					process.exit(0);
				});
			}
		} else if (input === "r") {
			loadDashboard();
		} else if (input === "f") {
			setFilterByCurrent((prev) => !prev);
		} else if (input === "[" || input === "]") {
			// Cycle current workspace
			const direction = input === "[" ? -1 : 1;
			const currentIndex = data.workspaces.findIndex(
				(w) => w.id === data.currentWorkspaceId,
			);
			const newIndex =
				(currentIndex + direction + data.workspaces.length) %
				data.workspaces.length;
			const newWorkspace = data.workspaces[newIndex];
			if (newWorkspace) {
				const workspaceOrchestrator = new WorkspaceOrchestrator(getDb());
				workspaceOrchestrator.use(newWorkspace.id).then(() => {
					loadDashboard();
				});
			}
		} else if (input === "o") {
			// Print cd hint for selected local workspace
			const selectedWorkspace = data.workspaces[selectedWorkspaceIndex];
			if (selectedWorkspace && "path" in selectedWorkspace) {
				console.log(`\n  cd ${selectedWorkspace.path}\n`);
			}
		}
	});

	if (loading) {
		return <Text>Loading dashboard...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (!data) {
		return <Text color="red">Error: Failed to load dashboard</Text>;
	}

	const { workspaces, processes, currentWorkspaceId, lastRefresh } = data;

	// Filter agents (exclude terminals)
	const agents = processes.filter((p) => p.type === ProcessType.AGENT);

	// Filter by workspace if enabled
	const selectedWorkspace = workspaces[selectedWorkspaceIndex];
	const displayWorkspaceId = filterByCurrent
		? currentWorkspaceId
		: selectedWorkspace?.id;
	const filteredAgents = displayWorkspaceId
		? agents.filter((a) => a.workspaceId === displayWorkspaceId)
		: agents;

	// Categorize agents by status
	const runningAgents = filteredAgents.filter(
		(a) => a.status === ProcessStatus.RUNNING || !a.endedAt,
	);
	const idleAgents = filteredAgents.filter(
		(a) => a.status === ProcessStatus.IDLE && !a.endedAt,
	);
	const stoppedAgents = filteredAgents.filter((a) => a.endedAt);
	const errorAgents = filteredAgents.filter(
		(a) => a.status === ProcessStatus.ERROR,
	);

	// Status badge helper
	const getStatusBadge = (agent: Process) => {
		if (agent.endedAt) {
			return <Text dimColor>[stopped]</Text>;
		}
		switch (agent.status) {
			case ProcessStatus.RUNNING:
				return <Text color="green">[running]</Text>;
			case ProcessStatus.IDLE:
				return <Text color="yellow">[idle]</Text>;
			case ProcessStatus.ERROR:
				return <Text color="red">[error]</Text>;
			default:
				return <Text dimColor>[unknown]</Text>;
		}
	};

	return (
		<Box flexDirection="column" paddingY={1}>
			{/* Header */}
			<Box marginBottom={1} paddingX={2}>
				<Box flexDirection="row" justifyContent="space-between">
					<Text bold>SUPERSET DASHBOARD</Text>
					<Text dimColor>{lastRefresh.toLocaleTimeString()}</Text>
				</Box>
				<Box marginTop={0}>
					<Text dimColor>{getSeparator(terminalWidth)}</Text>
				</Box>
			</Box>

			{/* Summary Stats */}
			<Box marginBottom={1} paddingX={2}>
				<Box
					flexDirection="row"
					gap={2}
					flexWrap={terminalWidth < 80 ? "wrap" : "nowrap"}
				>
					<Box flexDirection="row" gap={1}>
						<Text dimColor>Workspaces:</Text>
						<Text bold color="cyan">
							{workspaces.length}
						</Text>
					</Box>
					<Text dimColor>·</Text>
					<Box flexDirection="row" gap={1}>
						<Text dimColor>Running:</Text>
						<Text bold color="green">
							{runningAgents.length}
						</Text>
					</Box>
					<Text dimColor>·</Text>
					<Box flexDirection="row" gap={1}>
						<Text dimColor>Idle:</Text>
						<Text bold color="yellow">
							{idleAgents.length}
						</Text>
					</Box>
					{terminalWidth >= 60 && (
						<>
							<Text dimColor>·</Text>
							<Box flexDirection="row" gap={1}>
								<Text dimColor>Stopped:</Text>
								<Text bold dimColor>
									{stoppedAgents.length}
								</Text>
							</Box>
						</>
					)}
					{errorAgents.length > 0 && terminalWidth >= 80 && (
						<>
							<Text dimColor>·</Text>
							<Box flexDirection="row" gap={1}>
								<Text dimColor>Error:</Text>
								<Text bold color="red">
									{errorAgents.length}
								</Text>
							</Box>
						</>
					)}
				</Box>
			</Box>

			{/* Current Workspace & Controls */}
			<Box marginBottom={1} paddingX={2} flexDirection="row" gap={3}>
				{currentWorkspaceId && (
					<Box flexDirection="row" gap={1}>
						<Text dimColor>Active:</Text>
						<Text bold color="cyan">
							{truncate(
								workspaces.find((w) => w.id === currentWorkspaceId)?.name ||
									currentWorkspaceId.slice(0, 8),
								Math.max(15, Math.floor(terminalWidth / 4)),
							)}
						</Text>
					</Box>
				)}
				<Box flexDirection="row" gap={1}>
					<Text dimColor>Mode:</Text>
					<Text bold color={selectionMode === "workspace" ? "cyan" : "yellow"}>
						{selectionMode === "workspace" ? "Workspaces" : "Agents"}
					</Text>
					<Text dimColor>(tab)</Text>
				</Box>
				<Box flexDirection="row" gap={1}>
					<Text dimColor>Filter:</Text>
					<Text bold>
						{filterByCurrent
							? "Current"
							: selectedWorkspace
								? truncate(
										selectedWorkspace.name || selectedWorkspace.id.slice(0, 8),
										Math.max(10, Math.floor(terminalWidth / 6)),
									)
								: "All"}
					</Text>
					<Text dimColor>(f)</Text>
				</Box>
			</Box>

			<Box marginBottom={1} paddingX={2}>
				<Text dimColor>{getSeparator(terminalWidth)}</Text>
			</Box>

			{/* Workspaces Section */}
			<Box flexDirection="column" marginBottom={1} paddingX={2}>
				<Box marginBottom={0}>
					<Text bold>WORKSPACES</Text>
					<Text dimColor> ({workspaces.length})</Text>
				</Box>
				{workspaces.length === 0 ? (
					<Box paddingY={1} paddingLeft={2}>
						<Text dimColor>No workspaces. Run: </Text>
						<Text color="cyan">superset init</Text>
					</Box>
				) : (
					<Box flexDirection="column" paddingTop={0} paddingLeft={2}>
						{workspaces.map((ws, index) => {
							const wsAgents = agents.filter((a) => a.workspaceId === ws.id);
							const wsRunning = wsAgents.filter(
								(a) => a.status === ProcessStatus.RUNNING || !a.endedAt,
							);
							const isSelected =
								selectionMode === "workspace" &&
								index === selectedWorkspaceIndex;
							const isCurrent = ws.id === currentWorkspaceId;

							const wsName = ws.name || ws.id.slice(0, 8);
							const maxNameLength = Math.max(
								20,
								Math.floor((terminalWidth - 40) / 2),
							);

							return (
								<Box key={ws.id} flexDirection="row" gap={1} paddingY={0}>
									<Text color={isSelected ? "cyan" : undefined}>
										{isSelected ? "▸" : " "}
									</Text>
									<Text
										bold={isCurrent || isSelected}
										color={
											isSelected ? "cyan" : isCurrent ? "white" : undefined
										}
									>
										{truncate(wsName, maxNameLength)}
									</Text>
									<Text dimColor>({ws.type})</Text>
									<Text dimColor>
										{wsRunning.length > 0 && (
											<Text color="green">{wsRunning.length} running</Text>
										)}
										{wsRunning.length === 0 && wsAgents.length > 0 && (
											<Text dimColor>{wsAgents.length} idle</Text>
										)}
										{wsAgents.length === 0 && <Text dimColor>no agents</Text>}
									</Text>
									{isCurrent && (
										<Text color="cyan" bold>
											[active]
										</Text>
									)}
								</Box>
							);
						})}
					</Box>
				)}
			</Box>

			{/* Agents Section */}
			<Box flexDirection="column" marginBottom={1} paddingX={2}>
				<Box marginBottom={0}>
					<Text bold>AGENTS</Text>
					<Text dimColor> ({filteredAgents.length})</Text>
				</Box>
				{filteredAgents.length === 0 ? (
					<Box paddingY={1} paddingLeft={2}>
						<Text dimColor>No agents in this workspace</Text>
					</Box>
				) : (
					<Box flexDirection="column" paddingTop={0} paddingLeft={2}>
						{filteredAgents.map((agent, index) => {
							const isSelected =
								selectionMode === "agent" && index === selectedAgentIndex;
							const sessionName =
								agent.type === ProcessType.AGENT &&
								"sessionName" in agent &&
								agent.sessionName
									? String(agent.sessionName)
									: null;
							return (
								<Box key={agent.id} flexDirection="row" gap={1} paddingY={0}>
									<Text color={isSelected ? "yellow" : undefined}>
										{isSelected ? "▸" : " "}
									</Text>
									{getStatusBadge(agent)}
									<Text
										bold={isSelected}
										color={isSelected ? "yellow" : undefined}
									>
										{agent.type === ProcessType.AGENT &&
											"agentType" in agent &&
											String(agent.agentType)}
									</Text>
									{sessionName && (
										<Text dimColor>
											[{truncate(sessionName, 16)}]
										</Text>
									)}
									<Text dimColor>
										{new Date(agent.createdAt).toLocaleTimeString()}
									</Text>
								</Box>
							);
						})}
					</Box>
				)}
			</Box>

			<Box marginBottom={0} paddingX={2}>
				<Text dimColor>{getSeparator(terminalWidth)}</Text>
			</Box>

			{/* Keyboard Shortcuts */}
			<Box flexDirection="column" paddingX={2} paddingY={0}>
				<Box marginBottom={0}>
					<Text bold dimColor>
						CONTROLS
					</Text>
				</Box>
				<Box flexDirection="row" gap={2} paddingTop={0} paddingLeft={2}>
					<Box flexDirection="column">
						<Text dimColor>
							<Text>↑↓</Text> <Text>j k</Text> Navigate
						</Text>
						<Text dimColor>
							<Text>tab</Text> Switch mode
						</Text>
						<Text dimColor>
							<Text>⏎</Text> Launch agent
						</Text>
					</Box>
					<Box flexDirection="column">
						<Text dimColor>
							<Text>[ ]</Text> Cycle workspace
						</Text>
						<Text dimColor>
							<Text>f</Text> Toggle filter
						</Text>
						<Text dimColor>
							<Text>r</Text> Refresh
						</Text>
					</Box>
					<Box flexDirection="column">
						<Text dimColor>
							<Text>o</Text> Print cd path
						</Text>
						<Text dimColor>
							<Text>q</Text> <Text>esc</Text> Exit
						</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
