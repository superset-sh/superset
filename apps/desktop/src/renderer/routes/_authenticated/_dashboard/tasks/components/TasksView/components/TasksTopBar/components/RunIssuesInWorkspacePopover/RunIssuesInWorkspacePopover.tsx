import { plural } from "@lingui/core/macro";
import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
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
import { ChevronDownIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HiCheck, HiMiniPlay } from "react-icons/hi2";
import { AgentSelect } from "renderer/components/AgentSelect";
import { useRecentProjects } from "renderer/hooks/host-projects/useRecentProjects";
import { useHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { DevicePicker } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { useSelectedHostProjectIds } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceModalContent/hooks/useSelectedHostProjectIds";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { deriveBranchName } from "renderer/routes/_authenticated/utils/deriveBranchName";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import type { SelectedIssue } from "../../../GitHubIssuesContent";

const AGENT_STORAGE_KEY = "lastSelectedV2IssueBatchAgent";
const NONE = "none" as const;
type SelectedAgent = string | typeof NONE;

interface RunIssuesInWorkspacePopoverProps {
	issues: SelectedIssue[];
	projectFilter: string | null;
	onComplete: () => void;
}

function synthesizeIssuePrompt(issue: SelectedIssue): string {
	return `GitHub issue #${issue.issueNumber}: ${issue.title}\n${issue.url}`;
}

function issueSlug(issue: SelectedIssue): string {
	return `issue-${issue.issueNumber}`;
}

function readStoredAgent(): SelectedAgent {
	if (typeof window === "undefined") return NONE;
	const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
	return stored ? (stored as SelectedAgent) : NONE;
}

export function RunIssuesInWorkspacePopover({
	issues,
	projectFilter,
	onComplete,
}: RunIssuesInWorkspacePopoverProps) {
	const { t } = useLingui();
	const hostService = useLocalHostService();
	const { machineId, activeHostUrl } = hostService;
	const { otherHosts } = useWorkspaceHostOptions();
	const { submit } = useWorkspaceCreates();

	const lastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.lastHostId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);

	const [hostId, setHostId] = useState<string | null>(
		lastHostId ?? machineId ?? null,
	);

	const launchHostUrl = useHostUrl(hostId);
	const setUpProjectIds = useSelectedHostProjectIds(hostId);

	// Projects are fully local — shared host-fan-out list, with this
	// surface's per-host needsSetup overlay.
	const hostRecentProjects = useRecentProjects();
	const recentProjects = useMemo(
		() =>
			hostRecentProjects.map((project) => ({
				...project,
				needsSetup:
					setUpProjectIds === null ? null : !setUpProjectIds.has(project.id),
			})),
		[hostRecentProjects, setUpProjectIds],
	);

	const seededProjectId =
		projectFilter &&
		recentProjects.some((project) => project.id === projectFilter)
			? projectFilter
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

	const { agents: v2Agents, isFetched: v2AgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	const validAgentIds = useMemo(
		() => new Set(v2Agents.map((agent) => agent.id)),
		[v2Agents],
	);

	const [selectedAgent, setSelectedAgentState] =
		useState<SelectedAgent>(readStoredAgent);
	useEffect(() => {
		if (!v2AgentsFetched) return;
		if (selectedAgent !== NONE && validAgentIds.has(selectedAgent)) return;
		const stored = readStoredAgent();
		if (stored !== NONE && validAgentIds.has(stored)) {
			setSelectedAgentState(stored);
		} else if (selectedAgent !== NONE) {
			setSelectedAgentState(NONE);
		}
	}, [v2AgentsFetched, validAgentIds, selectedAgent]);
	const setSelectedAgent = (next: SelectedAgent) => {
		setSelectedAgentState(next);
		if (typeof window !== "undefined") {
			window.localStorage.setItem(AGENT_STORAGE_KEY, next);
		}
	};

	const [open, setOpen] = useState(false);
	const [projectPickerOpen, setProjectPickerOpen] = useState(false);

	// Workspaces launch against one project; a mixed-repo selection would
	// silently run every issue against a single repository.
	const issueProjectIds = useMemo(
		() => new Set(issues.map((issue) => issue.projectId)),
		[issues],
	);

	const hasMixedRepos = issueProjectIds.size > 1;

	const submitBlocker = useMemo<string | null>(() => {
		if (hasMixedRepos) {
			return t({
				message:
					"Selected issues span multiple repositories. Select issues from a single repository to run them.",
			});
		}
		if (!selectedProjectId)
			return t({
				message: "Select a project",
			});
		if (!hostId)
			return t({
				message: "No active host",
			});
		if (hostId !== machineId) {
			const remote = otherHosts.find((host) => host.id === hostId);
			if (!remote?.isOnline)
				return t({
					message: "Host is offline",
				});
		} else if (!activeHostUrl) {
			return t({
				message: "Host service is not running",
			});
		}
		if (setUpProjectIds === null)
			return t({
				message: "Checking host…",
			});
		if (selectedProject?.needsSetup === true) {
			return t({
				message: "Project not set up on this host",
			});
		}
		if (selectedAgent !== NONE) {
			if (!v2AgentsFetched)
				return t({
					message: "Checking agents…",
				});
			if (!validAgentIds.has(selectedAgent)) {
				return t({
					message: "Selected agent is not available on this host",
				});
			}
		}
		return null;
	}, [
		hasMixedRepos,
		selectedProjectId,
		selectedProject?.needsSetup,
		setUpProjectIds,
		selectedAgent,
		v2AgentsFetched,
		validAgentIds,
		hostId,
		machineId,
		otherHosts,
		activeHostUrl,
		t,
	]);

	const handleRun = () => {
		if (!selectedProjectId || !hostId) return;
		if (submitBlocker) {
			if (hostId === machineId && !activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "runIssuesInWorkspaces",
				});
			} else {
				toast.error(submitBlocker);
			}
			return;
		}

		setLastProjectId(selectedProjectId);

		const handles = issues.map((issue) =>
			submit({
				hostId,
				snapshot: {
					id: crypto.randomUUID(),
					projectId: selectedProjectId,
					name: issue.title,
					branch: deriveBranchName({
						slug: issueSlug(issue),
						title: issue.title,
					}),
					agents:
						selectedAgent === NONE
							? undefined
							: [
									{
										agent: selectedAgent,
										prompt: synthesizeIssuePrompt(issue),
									},
								],
				},
			}),
		);

		const promise = Promise.all(handles.map((handle) => handle.completed)).then(
			(outcomes) => {
				const failed = outcomes.filter((outcome) => !outcome.ok).length;
				if (failed > 0) {
					const firstFailure = outcomes.find((outcome) => !outcome.ok);
					const details =
						firstFailure && !firstFailure.ok ? `: ${firstFailure.error}` : "";
					throw new Error(
						`${outcomes.length - failed} of ${outcomes.length} succeeded${details}`,
					);
				}
				return outcomes.length;
			},
		);

		toast.promise(promise, {
			loading: t({
				message: plural(issues.length, {
					one: "Creating # workspace...",
					other: "Creating # workspaces...",
				}),
			}),
			success: (count) =>
				t({
					message: plural(count, {
						one: "Created # workspace",
						other: "Created # workspaces",
					}),
				}),
			error: (err) => errorMessage(err),
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
					<Trans>Run in Workspace</Trans>
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
											<Trans>Select project</Trans>
										</span>
									)}
								</span>
								<ChevronDownIcon className="size-4 opacity-50 shrink-0" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-60 p-0">
							<Command>
								<CommandInput
									placeholder={t({
										message: "Search projects...",
									})}
								/>
								<CommandList>
									<CommandEmpty>
										<Trans>No projects found.</Trans>
									</CommandEmpty>
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
														<Trans>not set up</Trans>
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
						placeholder={t({
							message: "Select agent",
						})}
						onValueChange={setSelectedAgent}
						onBeforeConfigureAgents={() => setOpen(false)}
						triggerClassName="h-8 text-xs w-full border-0 shadow-none bg-muted/50 rounded-md"
						allowNone
						noneLabel={t({
							message: "No agent",
						})}
						noneValue={NONE}
					/>
				</div>

				<div className="border-t border-border p-2">
					{hasMixedRepos && (
						<p className="mb-2 text-xs text-muted-foreground text-wrap-pretty">
							{submitBlocker}
						</p>
					)}
					<Button
						size="sm"
						className="w-full h-8"
						disabled={!!submitBlocker}
						title={submitBlocker ?? undefined}
						onClick={handleRun}
					>
						<Plural
							value={issues.length}
							one="Run # Workspace"
							other="Run # Workspaces"
						/>
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
