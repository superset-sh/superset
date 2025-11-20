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

				// Exit Ink immediately and launch agent
				const agentToAttach = selectedAgent as Agent;
				exit();
				setTimeout(async () => {
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
							// Log DB error but don't fail the process
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
				}, 100);
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

	const panelHeight = terminalHeight - 4;
	const leftPanelWidth = Math.floor(terminalWidth * 0.25);
	const middlePanelWidth = Math.floor(terminalWidth * 0.3);
	const rightPanelWidth = terminalWidth - leftPanelWidth - middlePanelWidth - 6;

	const getStatusIcon = (status: ProcessStatus, endedAt?: Date) => {
		if (endedAt) return "○";
		switch (status) {
			case ProcessStatus.RUNNING:
				return "●";
			case ProcessStatus.IDLE:
				return "○";
			default:
				return "○";
		}
	};

	const getStatusColor = (
		status: ProcessStatus,
		endedAt?: Date,
	): "green" | "yellow" | "gray" | undefined => {
		if (endedAt) return "gray";
		switch (status) {
			case ProcessStatus.RUNNING:
				return "green";
			case ProcessStatus.IDLE:
				return "yellow";
			default:
				return "gray";
		}
	};

	return (
		<Box flexDirection="column" height={terminalHeight}>
			{/* Header */}
			<Box
				borderStyle="single"
				borderColor="cyan"
				paddingX={1}
				height={3}
				width={terminalWidth}
			>
				<Box flexDirection="row" justifyContent="space-between" width="100%">
					<Text bold color="cyan">
						SUPERSET
					</Text>
					<Text dimColor>
						{selectedWorkspace &&
							`${selectedWorkspace.name || selectedWorkspace.id.slice(0, 8)}`}
					</Text>
				</Box>
			</Box>

			{/* Three Panel Layout */}
			<Box flexDirection="row" height={panelHeight}>
				{/* Left Panel - Workspaces */}
				<Box
					borderStyle="single"
					borderColor={activePanel === "workspaces" ? "cyan" : "gray"}
					flexDirection="column"
					width={leftPanelWidth}
					height={panelHeight}
				>
					<Box paddingX={1} borderBottom borderColor="gray">
						<Text
							bold
							color={activePanel === "workspaces" ? "cyan" : undefined}
						>
							WORKSPACES
						</Text>
					</Box>
					<Box flexDirection="column" paddingX={1} paddingY={0}>
						{workspaces.map((ws, index) => {
							const isSelected = index === selectedWorkspaceIndex;
							const isCurrent = ws.id === currentWorkspaceId;
							const wsAgents = agents.filter((a) => a.workspaceId === ws.id);
							const wsRunning = wsAgents.filter(
								(a) => a.status === ProcessStatus.RUNNING,
							);

							return (
								<Box key={ws.id} flexDirection="row" gap={1}>
									<Text
										bold={isSelected}
										color={isSelected ? "cyan" : isCurrent ? "white" : "gray"}
									>
										{isSelected ? "▸" : " "} {wsRunning.length > 0 ? "●" : "○"}{" "}
										{ws.name || ws.id.slice(0, 8)}
									</Text>
								</Box>
							);
						})}
						<Box marginTop={1}>
							<Text dimColor>[W] New</Text>
						</Box>
					</Box>
				</Box>

				{/* Middle Panel - Agents */}
				<Box
					borderStyle="single"
					borderColor={activePanel === "agents" ? "yellow" : "gray"}
					flexDirection="column"
					width={middlePanelWidth}
					height={panelHeight}
				>
					<Box paddingX={1} borderBottom borderColor="gray">
						<Text bold color={activePanel === "agents" ? "yellow" : undefined}>
							AGENTS ({filteredAgents.length})
						</Text>
					</Box>
					<Box flexDirection="column" paddingX={1} paddingY={0}>
						{filteredAgents.length === 0 ? (
							<Text dimColor>No agents</Text>
						) : (
							filteredAgents.map((agent, index) => {
								const isSelected = index === selectedAgentIndex;
								const agentType =
									agent.type === ProcessType.AGENT && "agentType" in agent
										? String(agent.agentType)
										: "unknown";
								const sessionName =
									agent.type === ProcessType.AGENT &&
									"sessionName" in agent &&
									agent.sessionName
										? String(agent.sessionName)
										: null;
								const timeAgo = Math.floor(
									(Date.now() - new Date(agent.createdAt).getTime()) / 60000,
								);

								return (
									<Box key={agent.id} flexDirection="row" gap={1}>
										<Text
											bold={isSelected}
											color={isSelected ? "yellow" : undefined}
										>
											{isSelected ? "▸" : " "}
										</Text>
										<Text
											color={getStatusColor(agent.status, agent.endedAt)}
											bold
										>
											{getStatusIcon(agent.status, agent.endedAt)}
										</Text>
										<Text
											bold={isSelected}
											color={isSelected ? "yellow" : undefined}
										>
											{sessionName || `${agentType}-${timeAgo}m`}
										</Text>
									</Box>
								);
							})
						)}
						<Box marginTop={1}>
							<Text dimColor>[N] New Agent</Text>
						</Box>
						<Box>
							<Text dimColor>[Enter] Open</Text>
						</Box>
					</Box>
				</Box>

				{/* Right Panel - Details */}
				<Box
					borderStyle="single"
					borderColor={activePanel === "details" ? "magenta" : "gray"}
					flexDirection="column"
					width={rightPanelWidth}
					height={panelHeight}
				>
					<Box paddingX={1} borderBottom borderColor="gray">
						<Text
							bold
							color={activePanel === "details" ? "magenta" : undefined}
						>
							DETAILS
						</Text>
					</Box>
					<Box flexDirection="column" paddingX={1} paddingY={0}>
						{selectedAgent ? (
							<>
								{/* Agent Details */}
								<Box flexDirection="column" marginBottom={1}>
									<Text bold color="yellow">
										{selectedAgent.type === ProcessType.AGENT &&
										"agentType" in selectedAgent
											? String(selectedAgent.agentType)
											: "Unknown"}
									</Text>
									<Text dimColor>
										Started:{" "}
										{Math.floor(
											(Date.now() -
												new Date(selectedAgent.createdAt).getTime()) /
												60000,
										)}
										m ago
									</Text>
									<Text>
										Status:{" "}
										<Text
											color={getStatusColor(
												selectedAgent.status,
												selectedAgent.endedAt,
											)}
										>
											{selectedAgent.endedAt ? "stopped" : selectedAgent.status}
										</Text>
									</Text>
									<Text dimColor>ID: {selectedAgent.id.slice(0, 8)}</Text>
								</Box>

								{/* Task Info */}
								{selectedAgent.title && (
									<Box flexDirection="column" marginBottom={1}>
										<Text bold>Task:</Text>
										<Text>{selectedAgent.title}</Text>
									</Box>
								)}

								{/* Workspace Info */}
								<Box flexDirection="column" marginBottom={1}>
									<Text bold>Workspace:</Text>
									<Text color="cyan">
										{workspaces.find((w) => w.id === selectedAgent.workspaceId)
											?.name || selectedAgent.workspaceId.slice(0, 8)}
									</Text>
								</Box>

								{/* Launch Command */}
								{selectedAgent.launchCommand && (
									<Box flexDirection="column" marginBottom={1}>
										<Text bold>Command:</Text>
										<Text dimColor>{selectedAgent.launchCommand}</Text>
									</Box>
								)}

								{/* Timestamps */}
								<Box flexDirection="column" marginBottom={1}>
									<Text bold>Timeline:</Text>
									<Text dimColor>
										Created:{" "}
										{new Date(selectedAgent.createdAt).toLocaleTimeString()}
									</Text>
									<Text dimColor>
										Updated:{" "}
										{new Date(selectedAgent.updatedAt).toLocaleTimeString()}
									</Text>
									{selectedAgent.endedAt && (
										<Text dimColor>
											Ended:{" "}
											{new Date(selectedAgent.endedAt).toLocaleTimeString()}
										</Text>
									)}
								</Box>
							</>
						) : (
							<Text dimColor>Select an agent to view details</Text>
						)}
					</Box>
				</Box>
			</Box>

			{/* Footer */}
			<Box borderStyle="single" borderColor="gray" paddingX={1} height={3}>
				<Box flexDirection="row" gap={2}>
					<Text>
						<Text bold>[1]</Text> Workspaces
					</Text>
					<Text dimColor>•</Text>
					<Text>
						<Text bold>[2]</Text> Agents
					</Text>
					<Text dimColor>•</Text>
					<Text>
						<Text bold>[3]</Text> Details
					</Text>
					<Text dimColor>•</Text>
					<Text>
						<Text bold>[Enter]</Text> Open Agent
					</Text>
					<Text dimColor>•</Text>
					<Text>
						<Text bold>[q]</Text> Exit
					</Text>
				</Box>
			</Box>
		</Box>
	);
}
