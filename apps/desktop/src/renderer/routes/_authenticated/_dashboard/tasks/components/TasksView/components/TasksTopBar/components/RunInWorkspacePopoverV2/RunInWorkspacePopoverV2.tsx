import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HiCheck, HiMiniPlay } from "react-icons/hi2";
import { AgentSelect } from "renderer/components/AgentSelect";
import { env } from "renderer/env.renderer";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentConfigs } from "renderer/hooks/useV2AgentConfigs";
import { authClient } from "renderer/lib/auth-client";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useSelectedHostProjectIds } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceModalContent/hooks/useSelectedHostProjectIds";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { MOCK_ORG_ID } from "shared/constants";
import { deriveBranchName } from "../../../../../../$taskId/utils/deriveBranchName";
import type { TaskWithStatus } from "../../../../hooks/useTasksTable";

const AGENT_STORAGE_KEY = "lastSelectedV2TaskBatchAgent";
const NONE = "none" as const;
type SelectedAgent = string | typeof NONE;

interface RunInWorkspacePopoverV2Props {
	tasks: TaskWithStatus[];
	onComplete: () => void;
}

function synthesizeTaskPrompt(task: TaskWithStatus): string {
	const header = `${task.slug}: ${task.title}`;
	const body = task.description?.trim();
	return body ? `${header}\n\n${body}` : header;
}

function readStoredAgent(): SelectedAgent {
	if (typeof window === "undefined") return NONE;
	const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
	return stored ? (stored as SelectedAgent) : NONE;
}

export function RunInWorkspacePopoverV2({
	tasks,
	onComplete,
}: RunInWorkspacePopoverV2Props) {
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const { otherHosts } = useWorkspaceHostOptions();
	const { submit } = useWorkspaceCreates();

	const lastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastHostId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);
	const lastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastProjectId,
	);
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);

	const [hostId, setHostId] = useState<string | null>(
		lastHostId ?? machineId ?? null,
	);

	const launchHostUrl = useHostUrl(hostId);
	const setUpProjectIds = useSelectedHostProjectIds(hostId);

	const { data: v2Projects } = useLiveQuery(
		(q) =>
			q
				.from({ projects: collections.v2Projects })
				.where(({ projects }) =>
					eq(projects.organizationId, activeOrganizationId ?? ""),
				)
				.select(({ projects }) => ({ ...projects })),
		[collections, activeOrganizationId],
	);

	const { data: githubRepositories } = useLiveQuery(
		(q) =>
			q.from({ repos: collections.githubRepositories }).select(({ repos }) => ({
				id: repos.id,
				owner: repos.owner,
				name: repos.name,
			})),
		[collections],
	);

	const recentProjects = useMemo(() => {
		const repoById = new Map(
			(githubRepositories ?? []).map((repo) => [repo.id, repo]),
		);
		return (v2Projects ?? []).map((project) => {
			const repo = project.githubRepositoryId
				? (repoById.get(project.githubRepositoryId) ?? null)
				: null;
			return {
				id: project.id,
				name: project.name,
				githubOwner: repo?.owner ?? null,
				iconUrl: project.iconUrl ?? null,
				needsSetup:
					setUpProjectIds === null ? null : !setUpProjectIds.has(project.id),
			};
		});
	}, [v2Projects, githubRepositories, setUpProjectIds]);

	const seededProjectId =
		lastProjectId &&
		recentProjects.some((project) => project.id === lastProjectId)
			? lastProjectId
			: (recentProjects[0]?.id ?? null);
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		seededProjectId,
	);
	useEffect(() => {
		if (
			selectedProjectId &&
			recentProjects.some((project) => project.id === selectedProjectId)
		) {
			return;
		}
		setSelectedProjectId(seededProjectId);
	}, [seededProjectId, selectedProjectId, recentProjects]);
	const selectedProject = recentProjects.find(
		(project) => project.id === selectedProjectId,
	);

	const v2AgentConfigsQuery = useV2AgentConfigs(launchHostUrl);
	const v2Agents = useMemo(
		() =>
			(v2AgentConfigsQuery.data ?? []).map((config) => ({
				id: config.id,
				label: config.label,
				iconId: config.presetId,
			})),
		[v2AgentConfigsQuery.data],
	);
	const validAgentIds = useMemo(
		() => new Set(v2Agents.map((agent) => agent.id)),
		[v2Agents],
	);

	const [selectedAgent, setSelectedAgentState] =
		useState<SelectedAgent>(readStoredAgent);
	useEffect(() => {
		if (!v2AgentConfigsQuery.isFetched) return;
		if (selectedAgent !== NONE && validAgentIds.has(selectedAgent)) return;
		const stored = readStoredAgent();
		if (stored !== NONE && validAgentIds.has(stored)) {
			setSelectedAgentState(stored);
		} else if (selectedAgent !== NONE) {
			setSelectedAgentState(NONE);
		}
	}, [v2AgentConfigsQuery.isFetched, validAgentIds, selectedAgent]);
	const setSelectedAgent = (next: SelectedAgent) => {
		setSelectedAgentState(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(AGENT_STORAGE_KEY, next);
		}
	};

	const [open, setOpen] = useState(false);
	const [projectPickerOpen, setProjectPickerOpen] = useState(false);

	const submitBlocker = useMemo<string | null>(() => {
		if (!selectedProjectId) return "Select a project";
		if (!hostId) return "No active host";
		if (hostId !== machineId) {
			const remote = otherHosts.find((host) => host.id === hostId);
			if (!remote?.isOnline) return "Host is offline";
		} else if (!activeHostUrl) {
			return "Host service is not running";
		}
		// Block while the host's project list is still loading — otherwise users
		// can submit before we know whether the project is set up there.
		if (setUpProjectIds === null) return "Checking host…";
		if (selectedProject?.needsSetup === true) {
			return "Project not set up on this host";
		}
		// Agent UUIDs are host-scoped; block until the host-specific config
		// query resolves and the selection is verified to exist there.
		if (selectedAgent !== NONE) {
			if (!v2AgentConfigsQuery.isFetched) return "Checking agents…";
			if (!validAgentIds.has(selectedAgent)) {
				return "Selected agent is not available on this host";
			}
		}
		return null;
	}, [
		selectedProjectId,
		selectedProject?.needsSetup,
		setUpProjectIds,
		selectedAgent,
		v2AgentConfigsQuery.isFetched,
		validAgentIds,
		hostId,
		machineId,
		otherHosts,
		activeHostUrl,
	]);

	const handleRun = () => {
		if (!selectedProjectId || !hostId) return;
		if (submitBlocker) {
			toast.error(submitBlocker);
			return;
		}

		const submissions = tasks.map((task) =>
			submit({
				hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: selectedProjectId,
					name: task.title,
					branch: deriveBranchName({ slug: task.slug, title: task.title }),
					taskId: task.id,
					agents:
						selectedAgent === NONE
							? undefined
							: [
									{
										agent: selectedAgent,
										prompt: synthesizeTaskPrompt(task),
									},
								],
				},
			}),
		);

		const promise = Promise.all(submissions).then((results) => {
			const failed = results.filter((r) => !r.ok).length;
			if (failed > 0) {
				throw new Error(
					`${results.length - failed} of ${results.length} succeeded`,
				);
			}
			return results.length;
		});

		toast.promise(promise, {
			loading: `Creating ${tasks.length} workspace${tasks.length === 1 ? "" : "s"}...`,
			success: (count) => `Created ${count} workspace${count === 1 ? "" : "s"}`,
			error: (err) => (err instanceof Error ? err.message : String(err)),
		});

		setOpen(false);
		onComplete();
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
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
			<PopoverContent align="start" className="w-72 p-0">
				<div className="flex flex-col gap-2 p-2">
					<DevicePicker
						hostId={hostId}
						onSelectHostId={(next) => {
							setHostId(next);
							setLastHostId(next);
						}}
						className="w-full max-w-none"
					/>

					<Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
						<PopoverTrigger asChild>
							<Button
								variant="ghost"
								size="sm"
								className="w-full justify-between font-normal h-8 min-w-0 bg-muted/50 rounded-md"
							>
								<span className="flex items-center gap-2 truncate">
									{selectedProject ? (
										<>
											<ProjectThumbnail
												projectName={selectedProject.name}
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
						</PopoverTrigger>
						<PopoverContent align="start" className="w-60 p-0">
							<Command>
								<CommandInput placeholder="Search projects..." />
								<CommandList>
									<CommandEmpty>No projects found.</CommandEmpty>
									<CommandGroup>
										{recentProjects.map((project) => (
											<CommandItem
												key={project.id}
												value={project.name}
												onSelect={() => {
													setSelectedProjectId(project.id);
													setLastProjectId(project.id);
													setProjectPickerOpen(false);
												}}
											>
												<ProjectThumbnail
													projectName={project.name}
													iconUrl={project.iconUrl}
													className="size-4"
												/>
												<span className="flex-1 truncate">{project.name}</span>
												{project.needsSetup === true && (
													<span className="text-[10px] text-amber-500">
														not set up
													</span>
												)}
												{project.id === selectedProjectId && (
													<HiCheck className="size-3.5 shrink-0" />
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</CommandList>
							</Command>
						</PopoverContent>
					</Popover>

					<AgentSelect<SelectedAgent>
						agents={v2Agents}
						value={selectedAgent}
						placeholder="Select agent"
						onValueChange={setSelectedAgent}
						onBeforeConfigureAgents={() => setOpen(false)}
						triggerClassName="h-8 text-xs w-full border-0 shadow-none bg-muted/50 rounded-md"
						allowNone
						noneLabel="No agent"
						noneValue={NONE}
					/>
				</div>

				<div className="border-t border-border p-2">
					<Button
						size="sm"
						className="w-full h-8"
						disabled={!!submitBlocker}
						onClick={handleRun}
					>
						Run {tasks.length} Workspace{tasks.length === 1 ? "" : "s"}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
