import { Box, Text, useApp, useInput, useStdout } from "ink";
import React from "react";
import { getDb } from "../lib/db";
import { launchAgent } from "../lib/launch/run";
import { ProcessOrchestrator } from "../lib/orchestrators/process-orchestrator";
import { WorkspaceOrchestrator } from "../lib/orchestrators/workspace-orchestrator";
import { type Agent, type Process, ProcessStatus, ProcessType } from "../types/process";
import type { Workspace } from "../types/workspace";

interface PanelsData {
	workspaces: Workspace[];
	processes: Process[];
	currentWorkspaceId?: string;
	lastRefresh: Date;
}

interface PanelsProps {
	onComplete?: () => void;
}

type ActivePanel = "workspaces" | "agents" | "details";

// Threshold for responsive layout - hide details panel and adjust widths below this
const SMALL_TERMINAL_THRESHOLD = 80;

export function Panels({ onComplete: _onComplete }: PanelsProps) {
	const [data, setData] = React.useState<PanelsData | null>(null);
	const [error, setError] = React.useState<string | null>(null);
	const [loading, setLoading] = React.useState(true);
	const [selectedWorkspaceIndex, setSelectedWorkspaceIndex] = React.useState(0);
	const [selectedAgentIndex, setSelectedAgentIndex] = React.useState(0);
	const [activePanel, setActivePanel] = React.useState<ActivePanel>("agents");
	const { exit } = useApp();
	const { stdout } = useStdout();

	const terminalWidth = stdout?.columns || 120;
	const terminalHeight = stdout?.rows || 30;

	const loadData = React.useCallback(async () => {
		try {
			const db = getDb();
			const workspaceOrchestrator = new WorkspaceOrchestrator(db);
			const processOrchestrator = new ProcessOrchestrator(db);

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

	React.useEffect(() => {
		loadData();
	}, [loadData]);

	React.useEffect(() => {
		const interval = setInterval(() => {
			loadData();
		}, 3000);

		return () => clearInterval(interval);
	}, [loadData]);

	useInput((input, key) => {
		if (!data) return;

		if (key.escape || input === "q" || (key.ctrl && input === "c")) {
			exit();
			return;
		}

		// Panel switching
		if (input === "1") {
			setActivePanel("workspaces");
			return;
		}
		if (input === "2") {
			setActivePanel("agents");
			return;
		}
		if (input === "3") {
			setActivePanel("details");
			return;
		}

		const agents = data.processes.filter((p) => p.type === ProcessType.AGENT);
		const selectedWorkspace = data.workspaces[selectedWorkspaceIndex];
		const filteredAgents = selectedWorkspace
			? agents.filter((a) => a.workspaceId === selectedWorkspace.id)
			: agents;

		// Navigation
		if (key.upArrow || input === "k") {
			if (activePanel === "workspaces") {
				setSelectedWorkspaceIndex((prev) =>
					prev > 0 ? prev - 1 : data.workspaces.length - 1,
				);
			} else if (activePanel === "agents") {
				setSelectedAgentIndex((prev) =>
					prev > 0 ? prev - 1 : filteredAgents.length - 1,
				);
			}
		} else if (key.downArrow || input === "j") {
			if (activePanel === "workspaces") {
				setSelectedWorkspaceIndex((prev) =>
					prev < data.workspaces.length - 1 ? prev + 1 : 0,
				);
			} else if (activePanel === "agents") {
				setSelectedAgentIndex((prev) =>
					prev < filteredAgents.length - 1 ? prev + 1 : 0,
				);
			}
		}

		// Attach to agent
		if (key.return && activePanel === "agents") {
			const selectedAgent = filteredAgents[selectedAgentIndex];
			if (selectedAgent) {
				if (selectedAgent.type !== ProcessType.AGENT) {
					return;
				}

				const agentToAttach = selectedAgent as Agent;
				// Exit Ink to stop useInput before tmux takes over stdin
				exit();
				setImmediate(async () => {
					const result = await launchAgent(agentToAttach, { attach: true });

					if (!result.success) {
						// Update agent status to STOPPED on failure
						try {
							const db = getDb();
							const orchestrator = new ProcessOrchestrator(db);
							await orchestrator.update(agentToAttach.id, {
								status: ProcessStatus.STOPPED,
								endedAt: new Date(),
							});
						} catch (dbError) {
							console.error(
								`\nWarning: Failed to update agent status: ${dbError instanceof Error ? dbError.message : String(dbError)}\n`,
							);
						}

						console.error(
							`\n❌ Failed to attach to ${agentToAttach.agentType} agent\n`,
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
		}

		if (input === "r") {
			loadData();
		}
	});

	if (loading) {
		return <Text>Loading panels...</Text>;
	}

	if (error) {
		return <Text color="red">Error: {error}</Text>;
	}

	if (!data) {
		return <Text color="red">Error: Failed to load data</Text>;
	}

	const { workspaces, processes, currentWorkspaceId } = data;

	const agents = processes.filter((p) => p.type === ProcessType.AGENT);
	const selectedWorkspace = workspaces[selectedWorkspaceIndex];
	const filteredAgents = selectedWorkspace
		? agents.filter((a) => a.workspaceId === selectedWorkspace.id)
		: agents;
	const selectedAgent = filteredAgents[selectedAgentIndex];

	return (
		<Box
			flexDirection="column"
			paddingX={1}
			paddingY={1}
			height={terminalHeight}
			width={terminalWidth}
		>
			{/* Header */}
			<Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
				<Text bold>SUPERSET PANELS</Text>
				<Text dimColor>{data.lastRefresh.toLocaleTimeString()}</Text>
			</Box>

			{/* Panels layout */}
			<Box flexDirection="row" gap={1} flexGrow={1}>
				{/* Workspaces panel */}
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={activePanel === "workspaces" ? "cyan" : "gray"}
					padding={1}
					width={
						terminalWidth < SMALL_TERMINAL_THRESHOLD
							? Math.max(20, Math.floor(terminalWidth * 0.35))
							: Math.max(24, Math.floor(terminalWidth * 0.25))
					}
				>
					<Box marginBottom={1}>
						<Text bold>Workspaces ({workspaces.length})</Text>
					</Box>
					{workspaces.length === 0 ? (
						<Text dimColor>No workspaces</Text>
					) : (
						<Box flexDirection="column" gap={0}>
							{workspaces.map((ws, index) => {
								const wsAgents = agents.filter((a) => a.workspaceId === ws.id);
								const wsRunning = wsAgents.filter(
									(a) => a.status === ProcessStatus.RUNNING || !a.endedAt,
								);
								const isSelected = index === selectedWorkspaceIndex;
								const isCurrent = ws.id === currentWorkspaceId;
								const statusEmoji = wsRunning.length > 0 ? "●" : "○";
								const statusColor = wsRunning.length > 0 ? "green" : "gray";

								return (
									<Box key={ws.id} flexDirection="column" marginBottom={1}>
										<Box flexDirection="row" gap={1}>
											<Text color={isSelected ? "cyan" : undefined}>
												{isSelected ? "▸" : " "}
											</Text>
											<Text color={statusColor}>{statusEmoji}</Text>
											<Text
												bold={isCurrent || isSelected}
												color={
													isSelected ? "cyan" : isCurrent ? "white" : undefined
												}
											>
												{ws.name || ws.id.slice(0, 8)}
											</Text>
										</Box>
										<Text dimColor>
											{"  "}
											{ws.type}
											{isCurrent && " (active)"}
										</Text>
									</Box>
								);
							})}
						</Box>
					)}
				</Box>

				{/* Agents panel */}
				<Box
					flexDirection="column"
					borderStyle="round"
					borderColor={activePanel === "agents" ? "yellow" : "gray"}
					padding={1}
					width={
						terminalWidth < SMALL_TERMINAL_THRESHOLD
							? undefined
							: Math.max(30, Math.floor(terminalWidth * 0.35))
					}
					flexGrow={terminalWidth < SMALL_TERMINAL_THRESHOLD ? 1 : 0}
				>
					<Box marginBottom={1}>
						<Text bold>Agents ({filteredAgents.length})</Text>
					</Box>
					{filteredAgents.length === 0 ? (
						<Text dimColor>No agents</Text>
					) : (
						<Box flexDirection="column" gap={0}>
							{filteredAgents.map((agent, index) => {
								const isSelected = index === selectedAgentIndex;
								const agentType =
									agent.type === ProcessType.AGENT && "agentType" in agent
										? String(agent.agentType)
										: "unknown";
								const statusEmoji =
									agent.status === ProcessStatus.RUNNING
										? "●"
										: agent.status === ProcessStatus.IDLE
											? "○"
											: agent.status === ProcessStatus.ERROR
												? "✗"
												: "○";
								const statusColor =
									agent.status === ProcessStatus.RUNNING
										? "green"
										: agent.status === ProcessStatus.IDLE
											? "yellow"
											: agent.status === ProcessStatus.ERROR
												? "red"
												: "gray";

								return (
									<Box key={agent.id} flexDirection="column" marginBottom={1}>
										<Box flexDirection="row" gap={1}>
											<Text color={isSelected ? "yellow" : undefined}>
												{isSelected ? "▸" : " "}
											</Text>
											<Text color={statusColor}>{statusEmoji}</Text>
											<Text
												bold={isSelected}
												color={isSelected ? "yellow" : undefined}
											>
												{agentType}
											</Text>
										</Box>
										<Text dimColor>
											{"  "}
											{new Date(agent.createdAt).toLocaleTimeString()}
										</Text>
									</Box>
								);
							})}
						</Box>
					)}
				</Box>

				{/* Details panel - hidden on small terminals */}
				{terminalWidth >= SMALL_TERMINAL_THRESHOLD && (
					<Box
						flexDirection="column"
						borderStyle="round"
						borderColor={activePanel === "details" ? "magenta" : "gray"}
						padding={1}
						flexGrow={1}
						minWidth={Math.max(30, Math.floor(terminalWidth * 0.3))}
					>
						<Box marginBottom={1}>
							<Text bold>Details</Text>
						</Box>
						{selectedAgent ? (
							<Box flexDirection="column" gap={0}>
								{selectedAgent.type === ProcessType.AGENT &&
								"agentType" in selectedAgent ? (
									<>
										<Text>
											Agent:{" "}
											<Text bold>{String(selectedAgent.agentType)}</Text>
										</Text>
										<Text dimColor>ID: {selectedAgent.id}</Text>
										{"sessionName" in selectedAgent &&
											selectedAgent.sessionName && (
												<Text dimColor>
													Session: {String(selectedAgent.sessionName)}
												</Text>
											)}
										<Text dimColor>Status: {selectedAgent.status}</Text>
										{selectedAgent.endedAt && (
											<Text dimColor>
												Ended: {new Date(selectedAgent.endedAt).toLocaleString()}
											</Text>
										)}
									</>
								) : (
									<Text dimColor>Not an agent</Text>
								)}
							</Box>
						) : (
							<Text dimColor>Select an agent to see details</Text>
						)}
					</Box>
				)}
			</Box>

			{/* Controls */}
			<Box marginTop={1} flexDirection="row" gap={2}>
				<Box flexDirection="row" gap={1}>
					<Text bold>[1]</Text>
					<Text>Workspaces</Text>
				</Box>
				<Box flexDirection="row" gap={1}>
					<Text bold>[2]</Text>
					<Text>Agents</Text>
				</Box>
				{terminalWidth >= SMALL_TERMINAL_THRESHOLD && (
					<Box flexDirection="row" gap={1}>
						<Text bold>[3]</Text>
						<Text>Details</Text>
					</Box>
				)}
				<Box flexDirection="row" gap={1}>
					<Text bold>↑↓</Text>
					<Text>j k</Text>
				</Box>
				<Box flexDirection="row" gap={1}>
					<Text bold>[Enter]</Text>
					<Text>Attach</Text>
				</Box>
				<Box flexDirection="row" gap={1}>
					<Text bold>[r]</Text>
					<Text>Refresh</Text>
				</Box>
				<Box flexDirection="row" gap={1}>
					<Text bold>[q]</Text>
					<Text>Exit</Text>
				</Box>
			</Box>
		</Box>
	);
}
