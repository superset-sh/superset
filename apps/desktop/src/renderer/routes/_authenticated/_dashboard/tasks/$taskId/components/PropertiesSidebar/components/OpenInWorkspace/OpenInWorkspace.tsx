import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HiArrowRight, HiChevronDown } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useAgentLaunchAgents } from "renderer/react-query/agent-presets";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import {
	buildPromptCommandFromAgentPreset,
	DEFAULT_AGENT_TASK_PROMPT_TEMPLATE,
	getDefaultAgentPreset,
	OPEN_AGENT_SETTINGS_OPTION,
	renderTaskPromptTemplate,
} from "shared/utils/agent-preset-settings";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { deriveBranchName } from "../../../../utils/deriveBranchName";

interface OpenInWorkspaceProps {
	task: TaskWithStatus;
}

export function OpenInWorkspace({ task }: OpenInWorkspaceProps) {
	const navigate = useNavigate();
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const {
		agentLabels,
		agentPresetById,
		fallbackAgent,
		selectableAgents,
		selectableAgentSet,
	} = useAgentLaunchAgents();
	const createWorkspace = useCreateWorkspace();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const isDark = useIsDarkTheme();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		() => localStorage.getItem("lastOpenedInProjectId"),
	);
	const [selectedAgent, setSelectedAgent] = useState<StartableAgentType>(() => {
		const stored = localStorage.getItem("lastSelectedAgent");
		return stored &&
			(STARTABLE_AGENT_TYPES as readonly string[]).includes(stored)
			? (stored as StartableAgentType)
			: "claude";
	});

	const effectiveProjectId = selectedProjectId ?? recentProjects[0]?.id ?? null;
	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);

	useEffect(() => {
		if (!selectedProjectId && recentProjects.length > 0) {
			setSelectedProjectId(recentProjects[0].id);
			localStorage.setItem("lastOpenedInProjectId", recentProjects[0].id);
		}
	}, [selectedProjectId, recentProjects]);

	useEffect(() => {
		if (selectableAgentSet.has(selectedAgent)) {
			return;
		}
		setSelectedAgent(fallbackAgent);
		localStorage.setItem("lastSelectedAgent", fallbackAgent);
	}, [selectedAgent, fallbackAgent, selectableAgentSet]);

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		await handleSelectProject(effectiveProjectId);
	};

	const taskPromptInput = {
		id: task.id,
		slug: task.slug,
		title: task.title,
		description: task.description,
		priority: task.priority,
		statusName: task.status.name,
		labels: task.labels,
	};

	const buildLaunchRequest = (workspaceId: string): AgentLaunchRequest => {
		if (selectedAgent === "superset-chat") {
			const template =
				agentPresetById.get("claude")?.taskPromptTemplate ??
				DEFAULT_AGENT_TASK_PROMPT_TEMPLATE;
			return {
				kind: "chat",
				workspaceId,
				agentType: "superset-chat",
				source: "open-in-workspace",
				chat: {
					initialPrompt: renderTaskPromptTemplate(template, taskPromptInput),
					retryCount: 1,
				},
			};
		}

		const selectedPreset =
			agentPresetById.get(selectedAgent) ??
			getDefaultAgentPreset(selectedAgent);
		const taskPrompt = renderTaskPromptTemplate(
			selectedPreset.taskPromptTemplate,
			taskPromptInput,
		);
		const command = buildPromptCommandFromAgentPreset({
			prompt: taskPrompt,
			randomId: window.crypto.randomUUID(),
			preset: selectedPreset,
		});

		if (!command) {
			throw new Error(`No command configured for agent "${selectedAgent}"`);
		}

		return {
			kind: "terminal",
			workspaceId,
			agentType: selectedAgent,
			source: "open-in-workspace",
			terminal: {
				command,
				name: task.slug,
			},
		};
	};

	const handleSelectProject = async (projectId: string) => {
		const branchName = deriveBranchName({
			slug: task.slug,
			title: task.title,
		});

		try {
			const launchRequestTemplate = buildLaunchRequest("pending-workspace");
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					name: task.slug,
					branchName,
				},
				{ agentLaunchRequest: launchRequestTemplate },
			);

			const launchRequest: AgentLaunchRequest = {
				...launchRequestTemplate,
				workspaceId: result.workspace.id,
			};
			if (result.wasExisting) {
				const launchResult = await launchAgentSession(launchRequest, {
					source: "open-in-workspace",
					createOrAttach: (input) => terminalCreateOrAttach.mutateAsync(input),
					write: (input) => terminalWrite.mutateAsync(input),
				});
				if (launchResult.status === "failed") {
					toast.error("Failed to start agent", {
						description: launchResult.error ?? "Failed to start agent session.",
					});
					return;
				}
			}

			toast.success(
				result.wasExisting ? "Opened existing workspace" : "Workspace created",
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			<span className="text-xs text-muted-foreground">Open in workspace</span>
			<div className="flex gap-1.5">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							size="sm"
							className="flex-1 justify-between font-normal h-8 min-w-0"
						>
							<span className="flex items-center gap-2 truncate">
								{selectedProject ? (
									<>
										<ProjectThumbnail
											projectId={selectedProject.id}
											projectName={selectedProject.name}
											projectColor={selectedProject.color}
											githubOwner={selectedProject.githubOwner}
											hideImage={selectedProject.hideImage ?? undefined}
											iconUrl={selectedProject.iconUrl}
											className="size-4"
										/>
										<span className="truncate">{selectedProject.name}</span>
									</>
								) : (
									<span className="text-muted-foreground">Select project</span>
								)}
							</span>
							<HiChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-[--radix-dropdown-menu-trigger-width]"
					>
						{recentProjects.length === 0 ? (
							<DropdownMenuItem disabled>No projects found</DropdownMenuItem>
						) : (
							recentProjects
								.filter((p) => p.id)
								.map((project) => (
									<DropdownMenuItem
										key={project.id}
										onClick={() => {
											setSelectedProjectId(project.id);
											localStorage.setItem("lastOpenedInProjectId", project.id);
										}}
										className="flex items-center gap-2"
									>
										<ProjectThumbnail
											projectId={project.id}
											projectName={project.name}
											projectColor={project.color}
											githubOwner={project.githubOwner}
											hideImage={project.hideImage ?? undefined}
											iconUrl={project.iconUrl}
											className="size-4"
										/>
										{project.name}
									</DropdownMenuItem>
								))
						)}
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					size="icon"
					className="h-8 w-8 shrink-0"
					disabled={!effectiveProjectId || createWorkspace.isPending}
					onClick={handleOpen}
				>
					<HiArrowRight className="w-3.5 h-3.5" />
				</Button>
			</div>
			<Select
				value={selectedAgent}
				onValueChange={(value) => {
					if (value === OPEN_AGENT_SETTINGS_OPTION) {
						navigate({ to: "/settings/agent" });
						return;
					}
					const nextAgent = value as StartableAgentType;
					setSelectedAgent(nextAgent);
					localStorage.setItem("lastSelectedAgent", nextAgent);
				}}
			>
				<SelectTrigger className="h-8 text-xs">
					<SelectValue placeholder="Select agent" />
				</SelectTrigger>
				<SelectContent>
					{selectableAgents.map((agent) => {
						const icon = getPresetIcon(agent, isDark);
						const label = agentLabels[agent] ?? agent;
						return (
							<SelectItem key={agent} value={agent}>
								<span className="flex items-center gap-2">
									{icon && (
										<img
											src={icon}
											alt=""
											className="size-3.5 object-contain"
										/>
									)}
									{label}
								</span>
							</SelectItem>
						);
					})}
					<SelectSeparator />
					<SelectItem value={OPEN_AGENT_SETTINGS_OPTION}>
						Agent settings...
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
