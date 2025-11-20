import { Box, Text, useApp, useInput } from "ink";
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

export function Dashboard({ onComplete }: DashboardProps) {
	const [data, setData] = React.useState<DashboardData | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [launching, setLaunching] = React.useState(false);
	const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = React.useState(0);
	const [selectedAgentIndex, setSelectedAgentIndex] = React.useState(0);
	const [selectionMode, setSelectionMode] =
		React.useState<SelectionMode>("workspace");
	const [filterByCurrent, setFilterByCurrent] = React.useState(false);
	const { exit } = useApp();

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

		const currentList =
			selectionMode === "workspace" ? data.workspaces : filteredAgents;
		const currentIndex =
			selectionMode === "workspace"
				? selectedWorkspaceIndex
				: selectedAgentIndex;

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
			if (
				selectionMode === "agent" &&
				filteredAgents[selectedAgentIndex] &&
				!launching
			) {
				const selectedAgent = filteredAgents[selectedAgentIndex];

				// Only launch agents, not terminals
				if (selectedAgent.type !== ProcessType.AGENT) {
					return;
				}

				// Exit the Ink app before launching
				// The launchAgent function will be called after exit
				setLaunching(true);

				// Small delay to let the UI update, then exit and launch
				const agentToLaunch = selectedAgent as Agent;
				setTimeout(() => {
					exit();
					// Give the terminal time to reset after Ink exits
					setTimeout(() => {
						launchAgent(agentToLaunch)
							.then((result) => {
								if (!result.success) {
									console.error(
										`\n❌ Failed to launch ${agentToLaunch.agentType} agent\n`,
									);
									console.error(`Error: ${result.error}\n`);
									if (result.exitCode !== undefined) {
										console.error(`Exit code: ${result.exitCode}\n`);
									}
									process.exit(1);
								}
								// Agent launched successfully and exited normally
								process.exit(0);
							})
							.catch((error) => {
								console.error(
									`\n❌ Failed to launch ${agentToLaunch.agentType} agent\n`,
								);
								console.error(
									`Error: ${error instanceof Error ? error.message : String(error)}\n`,
								);
								process.exit(1);
							});
					}, 200);
				}, 100);
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

	if (launching) {
		return <Text color="cyan">Launching agent...</Text>;
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
			return (
				<Text backgroundColor="gray" color="white">
					{" "}
					STOPPED{" "}
				</Text>
			);
		}
		switch (agent.status) {
			case ProcessStatus.RUNNING:
				return (
					<Text backgroundColor="green" color="black">
						{" "}
						RUNNING{" "}
					</Text>
				);
			case ProcessStatus.IDLE:
				return (
					<Text backgroundColor="yellow" color="black">
						{" "}
						IDLE{" "}
					</Text>
				);
			case ProcessStatus.ERROR:
				return (
					<Text backgroundColor="red" color="white">
						{" "}
						ERROR{" "}
					</Text>
				);
			default:
				return (
					<Text backgroundColor="gray" color="white">
						{" "}
						UNKNOWN{" "}
					</Text>
				);
		}
	};

	return (
		<Box flexDirection="column" paddingY={1}>
			{/* Header */}
			<Box
				marginBottom={1}
				borderStyle="double"
				borderColor="cyan"
				paddingX={2}
				paddingY={0}
			>
				<Box flexDirection="row" justifyContent="space-between">
					<Text bold color="cyan">
						✨ SUPERSET DASHBOARD
					</Text>
					<Text color="cyan" dimColor>
						{lastRefresh.toLocaleTimeString()}
					</Text>
				</Box>
			</Box>

			{/* Summary Stats */}
			<Box
				marginBottom={1}
				borderStyle="round"
				borderColor="blue"
				paddingX={2}
				paddingY={0}
			>
				<Box flexDirection="row" gap={3}>
					<Box flexDirection="row" gap={1}>
						<Text color="blue" bold>
							⚡
						</Text>
						<Text dimColor>Workspaces</Text>
						<Text bold color="blue">
							{workspaces.length}
						</Text>
					</Box>
					<Text dimColor>│</Text>
					<Box flexDirection="row" gap={1}>
						<Text color="green" bold>
							●
						</Text>
						<Text dimColor>Running</Text>
						<Text bold color="green">
							{runningAgents.length}
						</Text>
					</Box>
					<Text dimColor>│</Text>
					<Box flexDirection="row" gap={1}>
						<Text color="yellow" bold>
							●
						</Text>
						<Text dimColor>Idle</Text>
						<Text bold color="yellow">
							{idleAgents.length}
						</Text>
					</Box>
					<Text dimColor>│</Text>
					<Box flexDirection="row" gap={1}>
						<Text color="gray" bold>
							●
						</Text>
						<Text dimColor>Stopped</Text>
						<Text bold color="gray">
							{stoppedAgents.length}
						</Text>
					</Box>
					{errorAgents.length > 0 && (
						<>
							<Text dimColor>│</Text>
							<Box flexDirection="row" gap={1}>
								<Text color="red" bold>
									✖
								</Text>
								<Text dimColor>Error</Text>
								<Text bold color="red">
									{errorAgents.length}
								</Text>
							</Box>
						</>
					)}
				</Box>
			</Box>

			{/* Current Workspace Indicator */}
			{currentWorkspaceId && (
				<Box marginBottom={1} paddingX={1}>
					<Box
						borderStyle="round"
						borderColor="cyan"
						paddingX={1}
						flexDirection="row"
						gap={1}
					>
						<Text color="cyan" bold>
							▶
						</Text>
						<Text dimColor>Current:</Text>
						<Text bold color="cyan">
							{workspaces.find((w) => w.id === currentWorkspaceId)?.name ||
								currentWorkspaceId.slice(0, 8)}
						</Text>
					</Box>
				</Box>
			)}

			{/* Selection Mode & Filter */}
			<Box marginBottom={1} paddingX={1} flexDirection="row" gap={2}>
				<Box
					borderStyle="round"
					borderColor={selectionMode === "workspace" ? "cyan" : "yellow"}
					paddingX={1}
					flexDirection="row"
					gap={1}
				>
					<Text bold color={selectionMode === "workspace" ? "cyan" : "yellow"}>
						{selectionMode === "workspace" ? "📁 Workspaces" : "🤖 Agents"}
					</Text>
					<Text dimColor>(TAB)</Text>
				</Box>
				<Box borderStyle="round" borderColor="magenta" paddingX={1}>
					<Text dimColor>Filter: </Text>
					<Text color="magenta">
						{filterByCurrent
							? "Current workspace"
							: selectedWorkspace
								? `${selectedWorkspace.name || selectedWorkspace.id.slice(0, 8)}`
								: "All"}
					</Text>
					<Text dimColor> (f)</Text>
				</Box>
			</Box>

			{/* Workspaces Section */}
			<Box
				flexDirection="column"
				marginBottom={1}
				borderStyle="round"
				borderColor="cyan"
				paddingX={2}
				paddingY={0}
			>
				<Box marginBottom={0}>
					<Text bold color="cyan">
						📁 WORKSPACES
					</Text>
					<Text dimColor> ({workspaces.length})</Text>
				</Box>
				{workspaces.length === 0 ? (
					<Box paddingY={1}>
						<Text dimColor>
							No workspaces found. Run:{" "}
							<Text color="yellow">superset init</Text>
						</Text>
					</Box>
				) : (
					<Box flexDirection="column" paddingTop={0}>
						{workspaces.map((ws, index) => {
							const wsAgents = agents.filter((a) => a.workspaceId === ws.id);
							const wsRunning = wsAgents.filter(
								(a) => a.status === ProcessStatus.RUNNING || !a.endedAt,
							);
							const isSelected =
								selectionMode === "workspace" &&
								index === selectedWorkspaceIndex;
							const isCurrent = ws.id === currentWorkspaceId;

							return (
								<Box
									key={ws.id}
									flexDirection="row"
									gap={1}
									paddingY={0}
									backgroundColor={isSelected ? "blue" : undefined}
								>
									<Text bold color={isSelected ? "white" : undefined}>
										{isSelected ? "▶" : " "}
									</Text>
									<Text color={isSelected ? "white" : undefined}>
										{wsRunning.length > 0 ? (
											<Text
												color={isSelected ? "white" : "green"}
												bold={!isSelected}
											>
												●
											</Text>
										) : (
											<Text
												dimColor={!isSelected}
												color={isSelected ? "white" : undefined}
											>
												○
											</Text>
										)}
									</Text>
									<Text
										bold={isCurrent || isSelected}
										color={
											isSelected ? "white" : isCurrent ? "cyan" : undefined
										}
									>
										{ws.name || ws.id.slice(0, 8)}
									</Text>
									<Text
										dimColor={!isSelected}
										color={isSelected ? "white" : undefined}
									>
										({ws.type})
									</Text>
									<Text
										dimColor={!isSelected}
										color={isSelected ? "white" : undefined}
									>
										{wsRunning.length}/{wsAgents.length} agents
									</Text>
									{isCurrent && !isSelected && (
										<Text backgroundColor="cyan" color="black">
											{" "}
											CURRENT{" "}
										</Text>
									)}
								</Box>
							);
						})}
					</Box>
				)}
			</Box>

			{/* Agents Section */}
			<Box
				flexDirection="column"
				marginBottom={1}
				borderStyle="round"
				borderColor="yellow"
				paddingX={2}
				paddingY={0}
			>
				<Box marginBottom={0}>
					<Text bold color="yellow">
						🤖 AGENTS
					</Text>
					<Text dimColor> ({filteredAgents.length})</Text>
				</Box>
				{filteredAgents.length === 0 ? (
					<Box paddingY={1}>
						<Text dimColor>No agents in this workspace</Text>
					</Box>
				) : (
					<Box flexDirection="column" paddingTop={0}>
						{filteredAgents.map((agent, index) => {
							const isSelected =
								selectionMode === "agent" && index === selectedAgentIndex;
							return (
								<Box
									key={agent.id}
									flexDirection="row"
									gap={1}
									paddingY={0}
									backgroundColor={isSelected ? "yellow" : undefined}
								>
									<Text bold color={isSelected ? "black" : undefined}>
										{isSelected ? "▶" : " "}
									</Text>
									{getStatusBadge(agent)}
									<Text
										bold={isSelected}
										color={isSelected ? "black" : "yellow"}
									>
										{agent.type === ProcessType.AGENT &&
											"agentType" in agent &&
											String(agent.agentType)}
									</Text>
									<Text
										dimColor={!isSelected}
										color={isSelected ? "black" : undefined}
									>
										({agent.id.slice(0, 8)})
									</Text>
									<Text
										dimColor={!isSelected}
										color={isSelected ? "black" : undefined}
									>
										{new Date(agent.createdAt).toLocaleTimeString()}
									</Text>
								</Box>
							);
						})}
					</Box>
				)}
			</Box>

			{/* Keyboard Shortcuts */}
			<Box
				flexDirection="column"
				borderStyle="double"
				borderColor="magenta"
				paddingX={2}
				paddingY={0}
			>
				<Box marginBottom={0}>
					<Text bold color="magenta">
						⌨️ KEYBOARD SHORTCUTS
					</Text>
				</Box>
				<Box flexDirection="row" gap={3} paddingTop={0}>
					<Box flexDirection="column">
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								↑↓{" "}
							</Text>{" "}
							<Text backgroundColor="white" color="black">
								{" "}
								j{" "}
							</Text>{" "}
							<Text backgroundColor="white" color="black">
								{" "}
								k{" "}
							</Text>{" "}
							Navigate
						</Text>
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								TAB{" "}
							</Text>{" "}
							Switch mode
						</Text>
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								⏎{" "}
							</Text>{" "}
							Launch agent
						</Text>
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								[{" "}
							</Text>{" "}
							<Text backgroundColor="white" color="black">
								{" "}
								]{" "}
							</Text>{" "}
							Cycle workspace
						</Text>
					</Box>
					<Box flexDirection="column">
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								f{" "}
							</Text>{" "}
							Toggle filter
						</Text>
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								r{" "}
							</Text>{" "}
							Refresh
						</Text>
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								o{" "}
							</Text>{" "}
							Print cd path
						</Text>
						<Text dimColor>
							<Text backgroundColor="white" color="black">
								{" "}
								q{" "}
							</Text>{" "}
							<Text backgroundColor="white" color="black">
								{" "}
								ESC{" "}
							</Text>{" "}
							Exit
						</Text>
					</Box>
				</Box>
			</Box>
		</Box>
	);
}
