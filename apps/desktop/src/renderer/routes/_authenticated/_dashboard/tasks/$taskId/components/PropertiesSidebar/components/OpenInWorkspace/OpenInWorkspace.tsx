import type { TaskInput } from "@superset/shared/agent-command";
import {
	buildAgentFileCommand,
	buildAgentTaskPrompt,
} from "@superset/shared/agent-command";
import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_LABELS,
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
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Switch } from "@superset/ui/switch";
import { useEffect, useState } from "react";
import { HiArrowRight, HiChevronDown } from "react-icons/hi2";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import type { TaskWithStatus } from "../../../../../components/TasksView/hooks/useTasksTable";
import { deriveBranchName } from "../../../../utils/deriveBranchName";

interface OpenInWorkspaceProps {
	task: TaskWithStatus;
	draftTitle?: string;
	draftDescription?: string;
}

export function OpenInWorkspace({
	task,
	draftTitle,
	draftDescription,
}: OpenInWorkspaceProps) {
	const collections = useCollections();
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const isDark = useIsDarkTheme();
	const selectableAgents =
		STARTABLE_AGENT_TYPES as readonly StartableAgentType[];
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
	const [autoRun, setAutoRun] = useState(
		() => localStorage.getItem("agentAutoRun") !== "false",
	);

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
		if ((STARTABLE_AGENT_TYPES as readonly string[]).includes(selectedAgent)) {
			return;
		}
		setSelectedAgent("claude");
		localStorage.setItem("lastSelectedAgent", "claude");
	}, [selectedAgent]);

	const handleOpen = async () => {
		if (!effectiveProjectId) return;
		await handleSelectProject(effectiveProjectId);
	};

	const getLaunchTaskInput = (): TaskInput => {
		const latestTask = collections.tasks.get(task.id) ?? task;
		const latestStatus = latestTask.statusId
			? collections.taskStatuses.get(latestTask.statusId)
			: null;
		const normalizedDraftTitle = draftTitle?.trim();

		return {
			id: latestTask.id,
			slug: latestTask.slug,
			title: normalizedDraftTitle || latestTask.title,
			description: draftDescription ?? latestTask.description,
			priority: latestTask.priority,
			statusName: latestStatus?.name ?? task.status.name,
			labels: latestTask.labels,
		};
	};

	const buildLaunchRequest = (
		workspaceId: string,
		launchTask: TaskInput,
	): AgentLaunchRequest => {
		if (selectedAgent === "superset-chat") {
			return {
				kind: "chat",
				workspaceId,
				agentType: "superset-chat",
				source: "open-in-workspace",
				chat: {
					initialPrompt: buildAgentTaskPrompt(launchTask),
					retryCount: 1,
					autoExecute: autoRun,
					taskSlug: launchTask.slug,
				},
			};
		}

		const taskPromptFileName = `task-${launchTask.slug}.md`;
		return {
			kind: "terminal",
			workspaceId,
			agentType: selectedAgent,
			source: "open-in-workspace",
			terminal: {
				command: buildAgentFileCommand({
					filePath: `.superset/${taskPromptFileName}`,
					agent: selectedAgent,
				}),
				name: launchTask.slug,
				taskPromptContent: buildAgentTaskPrompt(launchTask),
				taskPromptFileName,
				autoExecute: autoRun,
			},
		};
	};

	const handleSelectProject = async (projectId: string) => {
		const launchTask = getLaunchTaskInput();
		const branchName = deriveBranchName({
			slug: launchTask.slug,
			title: launchTask.title,
		});
		const launchRequestTemplate = buildLaunchRequest(
			"pending-workspace",
			launchTask,
		);

		try {
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					name: launchTask.slug,
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
				onValueChange={(value: StartableAgentType) => {
					setSelectedAgent(value);
					localStorage.setItem("lastSelectedAgent", value);
				}}
			>
				<SelectTrigger className="h-8 text-xs">
					<SelectValue placeholder="Select agent" />
				</SelectTrigger>
				<SelectContent>
					{selectableAgents.map((agent) => {
						const icon = getPresetIcon(agent, isDark);
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
									{STARTABLE_AGENT_LABELS[agent]}
								</span>
							</SelectItem>
						);
					})}
				</SelectContent>
			</Select>
			<div className="flex items-center justify-between">
				<Label htmlFor="auto-run-toggle" className="text-xs font-normal">
					Auto-run command
				</Label>
				<Switch
					id="auto-run-toggle"
					checked={autoRun}
					onCheckedChange={(value) => {
						setAutoRun(value);
						localStorage.setItem("agentAutoRun", String(value));
					}}
				/>
			</div>
		</div>
	);
}
