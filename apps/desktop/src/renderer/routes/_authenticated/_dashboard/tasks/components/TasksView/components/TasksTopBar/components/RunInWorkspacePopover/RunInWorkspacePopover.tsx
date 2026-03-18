import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Switch } from "@superset/ui/switch";
import { ChevronDownIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { HiCheck, HiMiniPlay, HiXMark } from "react-icons/hi2";
import { LuCircle } from "react-icons/lu";
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
import { deriveBranchName } from "../../../../../../$taskId/utils/deriveBranchName";
import type { TaskWithStatus } from "../../../../hooks/useTasksTable";

type TaskStatus = "pending" | "creating" | "done" | "failed";
type TaskLaunchAgent = AgentDefinitionId | "none";

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

	const [open, setOpen] = useState(false);
	const [isRunning, setIsRunning] = useState(false);
	const [taskStatuses, setTaskStatuses] = useState<Map<string, TaskStatus>>(
		new Map(),
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

	const abortRef = useRef(false);
	const selectedProject = recentProjects.find(
		(p) => p.id === effectiveProjectId,
	);

	const buildLaunchRequest = (
		task: TaskWithStatus,
		workspaceId: string,
	): AgentLaunchRequest | null =>
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

	const handleRun = async () => {
		if (!effectiveProjectId) return;
		if (
			selectedAgent !== "none" &&
			!agentConfigsById.get(selectedAgent)?.enabled
		) {
			toast.error("Enable an agent in Settings > Agents first");
			return;
		}

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
					{ agentLaunchRequest: launchRequestTemplate ?? undefined },
				);

				if (result.wasExisting && launchRequestTemplate) {
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

					<AgentSelect<TaskLaunchAgent>
						agents={enabledAgentPresets}
						value={selectedAgent}
						placeholder="Select agent"
						onValueChange={setSelectedAgent}
						onBeforeConfigureAgents={() => setOpen(false)}
						disabled={isRunning}
						triggerClassName="h-8 text-xs w-full border-0 shadow-none bg-muted/50 rounded-md"
						allowNone
						noneLabel="No agent"
						noneValue="none"
					/>

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
