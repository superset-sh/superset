import type {
	AgentLaunchRequest,
	StartableAgentType,
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
	SelectSeparator,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Switch } from "@superset/ui/switch";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { useRef, useState } from "react";
import { HiCheck, HiMiniPlay, HiXMark } from "react-icons/hi2";
import { LuCircle } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useAgentLaunchAgents } from "renderer/react-query/agent-presets";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { buildTaskAgentLaunchRequest } from "shared/utils/agent-launch-request";
import { OPEN_AGENT_SETTINGS_OPTION } from "shared/utils/agent-preset-settings";
import { deriveBranchName } from "../../../../../../$taskId/utils/deriveBranchName";
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
	const navigate = useNavigate();
	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const { agentLabels, agentPresetById, fallbackAgent, selectableAgents } =
		useAgentLaunchAgents();
	const createWorkspace = useCreateWorkspace({ skipNavigation: true });
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const isDark = useIsDarkTheme();

	const [open, setOpen] = useState(false);
	const {
		autoRun,
		effectiveProjectId,
		selectedAgent,
		setAutoRun,
		setSelectedAgent,
		setSelectedProjectId,
	} = useAgentLaunchPreferences<StartableAgentType>({
		agentStorageKey: "lastSelectedAgent",
		defaultAgent: "claude",
		fallbackAgent,
		validAgents: selectableAgents,
		projectStorageKey: "lastOpenedInProjectId",
		recentProjects,
		autoRunStorageKey: "agentAutoRun",
	});
	const [isRunning, setIsRunning] = useState(false);
	const [taskStatuses, setTaskStatuses] = useState<Map<string, TaskStatus>>(
		new Map(),
	);

	const abortRef = useRef(false);
	const selectedProject = recentProjects.find(
		(project) => project.id === effectiveProjectId,
	);

	const buildLaunchRequest = (
		task: TaskWithStatus,
		workspaceId: string,
	): AgentLaunchRequest => {
		return buildTaskAgentLaunchRequest({
			workspaceId,
			source: "open-in-workspace",
			selectedAgent,
			task: {
				id: task.id,
				slug: task.slug,
				title: task.title,
				description: task.description,
				priority: task.priority,
				statusName: task.status.name,
				labels: task.labels,
			},
			autoRun,
			agentPresetById,
		});
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

			setTaskStatuses((previousStatuses) => {
				const nextStatuses = new Map(previousStatuses);
				nextStatuses.set(task.id, "creating");
				return nextStatuses;
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

				setTaskStatuses((previousStatuses) => {
					const nextStatuses = new Map(previousStatuses);
					nextStatuses.set(task.id, "done");
					return nextStatuses;
				});
				successCount++;
			} catch (err) {
				console.error(
					`[RunInWorkspacePopover] Failed to create workspace for task ${task.slug}:`,
					err,
				);
				setTaskStatuses((previousStatuses) => {
					const nextStatuses = new Map(previousStatuses);
					nextStatuses.set(task.id, "failed");
					return nextStatuses;
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
			onOpenChange={(nextOpen) => {
				if (isRunning) return;
				setOpen(nextOpen);
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
				onPointerDownOutside={(event) => {
					if (isRunning) event.preventDefault();
				}}
				onEscapeKeyDown={(event) => {
					if (isRunning) event.preventDefault();
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
									.filter((project) => project.id)
									.map((project) => (
										<DropdownMenuItem
											key={project.id}
											onClick={() => setSelectedProjectId(project.id)}
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
						onValueChange={(value) => {
							if (value === OPEN_AGENT_SETTINGS_OPTION) {
								setOpen(false);
								navigate({ to: "/settings/agent" });
								return;
							}
							setSelectedAgent(value as StartableAgentType);
						}}
						disabled={isRunning}
					>
						<SelectTrigger className="h-8 text-xs w-full border-0 shadow-none bg-muted/50 rounded-md">
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
							onCheckedChange={setAutoRun}
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
