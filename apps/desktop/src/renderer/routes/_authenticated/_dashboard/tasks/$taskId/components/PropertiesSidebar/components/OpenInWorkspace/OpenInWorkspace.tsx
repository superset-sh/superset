import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { HiArrowRight, HiChevronDown } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { buildTaskAgentLaunchRequest } from "shared/utils/agent-launch-request";
import {
	type AgentDefinitionId,
	getEnabledAgentConfigs,
	getFallbackAgentId,
	indexResolvedAgentConfigs,
} from "shared/utils/agent-settings";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { deriveBranchName } from "../../../../utils/deriveBranchName";

interface OpenInWorkspaceProps {
	task: TaskWithStatus;
}

const CONFIGURE_AGENTS_VALUE = "__configure_agents__";

export function OpenInWorkspace({ task }: OpenInWorkspaceProps) {
	const navigate = useNavigate();
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const isDark = useIsDarkTheme();
	const { data: agentPresets = [] } =
		electronTrpc.settings.getAgentPresets.useQuery();
	const enabledAgentPresets = useMemo(
		() => getEnabledAgentConfigs(agentPresets),
		[agentPresets],
	);
	const agentConfigsById = useMemo(
		() => indexResolvedAgentConfigs(agentPresets),
		[agentPresets],
	);
	const fallbackAgentId = useMemo(
		() => getFallbackAgentId(agentPresets),
		[agentPresets],
	);
	const selectableAgents = useMemo(
		() => enabledAgentPresets.map((preset) => preset.id),
		[enabledAgentPresets],
	);
	const {
		autoRun,
		effectiveProjectId,
		selectedAgent,
		setAutoRun,
		setSelectedAgent,
		setSelectedProjectId,
	} = useAgentLaunchPreferences<AgentDefinitionId>({
		agentStorageKey: "lastSelectedAgent",
		defaultAgent: fallbackAgentId ?? "claude",
		fallbackAgent: fallbackAgentId ?? "claude",
		validAgents: selectableAgents.length > 0 ? selectableAgents : ["claude"],
		projectStorageKey: "lastOpenedInProjectId",
		recentProjects,
		autoRunStorageKey: "agentAutoRun",
	});

	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);
	const selectedAgentValue = selectableAgents.includes(selectedAgent)
		? selectedAgent
		: undefined;

	const handleAgentValueChange = (value: string) => {
		if (value === CONFIGURE_AGENTS_VALUE) {
			navigate({ to: "/settings/agents" });
			return;
		}

		setSelectedAgent(value as AgentDefinitionId);
	};

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		if (!agentConfigsById.has(selectedAgent)) {
			toast.error("Enable an agent in Settings > Agents first");
			return;
		}
		await handleSelectProject(effectiveProjectId);
	};

	const buildLaunchRequest = (workspaceId: string): AgentLaunchRequest =>
		buildTaskAgentLaunchRequest({
			task: {
				id: task.id,
				slug: task.slug,
				title: task.title,
				description: task.description,
				priority: task.priority,
				statusName: task.status.name,
				labels: task.labels,
			},
			workspaceId,
			selectedAgent,
			source: "open-in-workspace",
			autoRun,
			configsById: agentConfigsById,
		});

	const handleSelectProject = async (projectId: string) => {
		const branchName = deriveBranchName({
			slug: task.slug,
			title: task.title,
		});
		const launchRequestTemplate = buildLaunchRequest("pending-workspace");

		try {
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
					disabled={
						!effectiveProjectId ||
						createWorkspace.isPending ||
						selectableAgents.length === 0
					}
					onClick={handleOpen}
				>
					<HiArrowRight className="w-3.5 h-3.5" />
				</Button>
			</div>
			<Select value={selectedAgentValue} onValueChange={handleAgentValueChange}>
				<SelectTrigger className="h-8 text-xs">
					<SelectValue placeholder="Select agent" />
				</SelectTrigger>
				<SelectContent>
					{selectableAgents.map((agent) => {
						const icon = getPresetIcon(agent, isDark);
						const config = agentConfigsById.get(agent);
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
									{config?.label ?? agent}
								</span>
							</SelectItem>
						);
					})}
					<SelectSeparator />
					<SelectItem value={CONFIGURE_AGENTS_VALUE}>
						Configure agents...
					</SelectItem>
				</SelectContent>
			</Select>
			<div className="flex items-center justify-between">
				<Label htmlFor="auto-run-toggle" className="text-xs font-normal">
					Auto-run command
				</Label>
				<Switch
					id="auto-run-toggle"
					checked={autoRun}
					onCheckedChange={setAutoRun}
				/>
			</div>
		</div>
	);
}
