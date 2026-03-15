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
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Switch } from "@superset/ui/switch";
import { useLiveQuery } from "@tanstack/react-db";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { HiCheck, HiMiniPlay, HiXMark } from "react-icons/hi2";
import { LuCircle } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { deriveBranchName } from "../../../../../../$taskId/utils/deriveBranchName";
import { resolveInProgressStatus } from "../../../../../../utils/resolveInProgressStatus";
import type { TaskWithStatus } from "../../../../hooks/useTasksTable";

type TaskStatus = "pending" | "creating" | "done" | "failed";

function BatchStatusIcon({ status }: { status: TaskStatus }) {
	switch (status) {
		case "pending":
			return <LuCircle className="size-3 text-muted-foreground" />;
		case "creating":
			return <Spinner className="size-3" />;
		case "done":
			return <HiCheck className="size-3 text-green-500" />;
		case "failed":
			return <HiXMark className="size-3 text-destructive" />;
	}
}

interface RunInWorkspacePopoverProps {
	tasks: TaskWithStatus[];
	onComplete: () => void;
}

export function RunInWorkspacePopover({
	tasks,
	onComplete,
}: RunInWorkspacePopoverProps) {
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const createWorkspace = useCreateWorkspace({ skipNavigation: true });
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const isDark = useIsDarkTheme();
	const collections = useCollections();
	const selectableAgents =
		STARTABLE_AGENT_TYPES as readonly StartableAgentType[];

	const { data: allStatuses } = useLiveQuery(
		(q) => q.from({ taskStatuses: collections.taskStatuses }),
		[collections],
	);
	const inProgressStatus = useMemo(
		() => resolveInProgressStatus(allStatuses ?? []),
		[allStatuses],
	);

	const [open, setOpen] = useState(false);
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
	const [isRunning, setIsRunning] = useState(false);
	const [taskStatuses, setTaskStatuses] = useState<Map<string, TaskStatus>>(
		new Map(),
	);

	const abortRef = useRef(false);

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

	const buildLaunchRequest = (
		task: TaskWithStatus,
		workspaceId: string,
	): AgentLaunchRequest => {
		const taskInput = {
			id: task.id,
			slug: task.slug,
			title: task.title,
			description: task.description,
			priority: task.priority,
			statusName: task.status.name,
			labels: task.labels,
		};

		if (selectedAgent === "superset-chat") {
			return {
				kind: "chat",
				workspaceId,
				agentType: "superset-chat",
				source: "open-in-workspace",
				chat: {
					initialPrompt: buildAgentTaskPrompt(taskInput),
					retryCount: 1,
					autoExecute: autoRun,
					taskSlug: task.slug,
				},
			};
		}

		const taskPromptFileName = `task-${task.slug}.md`;
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
				name: task.slug,
				taskPromptContent: buildAgentTaskPrompt(taskInput),
				taskPromptFileName,
				autoExecute: autoRun,
			},
		};
	};

	const handleRun = async () => {
		if (!effectiveProjectId) return;

		abortRef.current = false;
		setIsRunning(true);

		const initial = new Map<string, TaskStatus>();
		for (const task of tasks) {
			initial.set(task.id, "pending");
		}
		setTaskStatuses(initial);

		let successCount = 0;
		let failCount = 0;

		for (const task of tasks) {
			if (abortRef.current) break;

			setTaskStatuses((prev) => {
				const next = new Map(prev);
				next.set(task.id, "creating");
				return next;
			});

			try {
				const branchName = deriveBranchName({
					slug: task.slug,
					title: task.title,
				});
				const launchRequestTemplate = buildLaunchRequest(
					task,
					"pending-workspace",
				);

				const result = await createWorkspace.mutateAsyncWithPendingSetup(
					{
						projectId: effectiveProjectId,
						name: task.slug,
						branchName,
					},
					{ agentLaunchRequest: launchRequestTemplate },
				);

				if (result.wasExisting) {
					const launchRequest: AgentLaunchRequest = {
						...launchRequestTemplate,
						workspaceId: result.workspace.id,
					};
					const launchResult = await launchAgentSession(launchRequest, {
						source: "open-in-workspace",
						createOrAttach: (input) =>
							terminalCreateOrAttach.mutateAsync(input),
						write: (input) => terminalWrite.mutateAsync(input),
					});
					if (launchResult.status === "failed") {
						throw new Error(
							launchResult.error ?? "Failed to start agent session",
						);
					}
				}

				setTaskStatuses((prev) => {
					const next = new Map(prev);
					next.set(task.id, "done");
					return next;
				});
				successCount++;

				if (inProgressStatus && task.statusId !== inProgressStatus.id) {
					try {
						collections.tasks.update(task.id, (draft) => {
							draft.statusId = inProgressStatus.id;
						});
					} catch (statusErr) {
						console.error(
							`[RunInWorkspacePopover] Failed to update task status for ${task.slug}:`,
							statusErr,
						);
					}
				}
			} catch (err) {
				console.error(
					`[RunInWorkspacePopover] Failed to create workspace for task ${task.slug}:`,
					err,
				);
				setTaskStatuses((prev) => {
					const next = new Map(prev);
					next.set(task.id, "failed");
					return next;
				});
				failCount++;
			}
		}

		setIsRunning(false);

		if (failCount === 0) {
			toast.success(
				`Created ${successCount} workspace${successCount === 1 ? "" : "s"}`,
			);
		} else {
			toast.warning(
				`Created ${successCount} workspace${successCount === 1 ? "" : "s"}, ${failCount} failed`,
			);
		}

		setOpen(false);
		setTaskStatuses(new Map());
		onComplete();
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				if (isRunning) return;
				setOpen(next);
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 text-xs gap-1.5 bg-muted/50"
				>
					<HiMiniPlay className="size-3" />
					Run in Workspace
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-64 p-0"
				onPointerDownOutside={(e) => {
					if (isRunning) e.preventDefault();
				}}
				onEscapeKeyDown={(e) => {
					if (isRunning) e.preventDefault();
				}}
			>
				<div className="flex flex-col gap-2 p-2">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-between font-normal h-8 min-w-0 bg-muted/50 rounded-md"
								disabled={isRunning}
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
										<span className="text-muted-foreground">
											Select project
										</span>
									)}
								</span>
								<ChevronDownIcon className="size-4 opacity-50 shrink-0" />
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
												localStorage.setItem(
													"lastOpenedInProjectId",
													project.id,
												);
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

					<Select
						value={selectedAgent}
						onValueChange={(value: StartableAgentType) => {
							setSelectedAgent(value);
							localStorage.setItem("lastSelectedAgent", value);
						}}
						disabled={isRunning}
					>
						<SelectTrigger className="h-8 text-xs w-full border-0 shadow-none bg-muted/50 rounded-md">
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

					<div className="flex items-center justify-between px-1">
						<Label
							htmlFor="batch-auto-run-toggle"
							className="text-xs font-normal"
						>
							Auto-run command
						</Label>
						<Switch
							id="batch-auto-run-toggle"
							checked={autoRun}
							onCheckedChange={(value) => {
								setAutoRun(value);
								localStorage.setItem("agentAutoRun", String(value));
							}}
							disabled={isRunning}
						/>
					</div>

					{isRunning && tasks.length > 0 && (
						<div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
							{tasks.map((task) => (
								<div
									key={task.id}
									className="flex items-center gap-2 text-xs text-muted-foreground"
								>
									<BatchStatusIcon
										status={taskStatuses.get(task.id) ?? "pending"}
									/>
									<span className="truncate">{task.slug}</span>
								</div>
							))}
						</div>
					)}
				</div>

				<div className="border-t border-border p-2">
					<Button
						size="sm"
						className="w-full h-8"
						disabled={!effectiveProjectId || isRunning}
						onClick={handleRun}
					>
						{isRunning ? (
							<>
								<Spinner className="size-3" />
								Creating...
							</>
						) : (
							<>
								Run {tasks.length} Workspace{tasks.length === 1 ? "" : "s"}
							</>
						)}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
