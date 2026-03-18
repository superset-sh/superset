import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useMemo } from "react";
import { HiArrowRight, HiChevronDown } from "react-icons/hi2";
import { AgentSelect } from "renderer/components/AgentSelect";
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

type TaskLaunchAgent = AgentDefinitionId | "none";

interface OpenInWorkspaceProps {
	task: TaskWithStatus;
}

export function OpenInWorkspace({ task }: OpenInWorkspaceProps) {
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const agentPresetsQuery = electronTrpc.settings.getAgentPresets.useQuery();
	const agentPresets = agentPresetsQuery.data ?? [];
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
	} = useAgentLaunchPreferences<TaskLaunchAgent>({
		agentStorageKey: "lastSelectedAgent",
		defaultAgent: fallbackAgentId ?? "none",
		fallbackAgent: fallbackAgentId ?? "none",
		validAgents: ["none", ...selectableAgents],
		agentsReady: agentPresetsQuery.isFetched,
		projectStorageKey: "lastOpenedInProjectId",
		recentProjects,
		autoRunStorageKey: "agentAutoRun",
	});

	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		if (
			selectedAgent !== "none" &&
			!agentConfigsById.get(selectedAgent)?.enabled
		) {
			toast.error("Enable an agent in Settings > Agents first");
			return;
		}
		await handleSelectProject(effectiveProjectId);
	};

	const buildLaunchRequest = (workspaceId: string): AgentLaunchRequest | null =>
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

		try {
			const launchRequestTemplate = buildLaunchRequest("pending-workspace");
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					name: task.slug,
					branchName,
				},
				{ agentLaunchRequest: launchRequestTemplate ?? undefined },
			);

			if (result.wasExisting && launchRequestTemplate) {
				const launchRequest: AgentLaunchRequest = {
					...launchRequestTemplate,
					workspaceId: result.workspace.id,
				};
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
					disabled={!effectiveProjectId || createWorkspace.isPending}
					onClick={handleOpen}
				>
					<HiArrowRight className="w-3.5 h-3.5" />
				</Button>
			</div>
			<AgentSelect<TaskLaunchAgent>
				agents={enabledAgentPresets}
				value={selectedAgent}
				placeholder="Select agent"
				onValueChange={setSelectedAgent}
				triggerClassName="h-8 text-xs"
				allowNone
				noneLabel="No agent"
				noneValue="none"
			/>
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
