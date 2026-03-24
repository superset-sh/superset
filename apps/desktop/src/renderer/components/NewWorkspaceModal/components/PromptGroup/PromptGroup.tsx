import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	usePromptInputAttachments,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@superset/ui/command";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowUpIcon,
	ExternalLinkIcon,
	PaperclipIcon,
	PlusIcon,
} from "lucide-react";
import {
	forwardRef,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	GoArrowUpRight,
	GoGitBranch,
	GoGlobe,
	GoIssueOpened,
} from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuFolderGit, LuFolderOpen, LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { AgentSelect } from "renderer/components/AgentSelect";
import { LinkedIssuePill } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import {
	useClearPendingWorkspace,
	useNewWorkspaceModalOpen,
	useSetPendingWorkspace,
	useSetPendingWorkspaceStatus,
} from "renderer/stores/new-workspace-modal";
import { buildPromptAgentLaunchRequest } from "shared/utils/agent-launch-request";
import {
	type AgentDefinitionId,
	getEnabledAgentConfigs,
	indexResolvedAgentConfigs,
} from "shared/utils/agent-settings";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";
import type { LinkedPR } from "../../NewWorkspaceModalDraftContext";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { GitHubIssueLinkCommand } from "./components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "./components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "./components/LinkedPRPill";
import { PRLinkCommand } from "./components/PRLinkCommand";
import type { OpenableWorktreeAction } from "./utils/resolveOpenableWorktrees";
import { resolveOpenableWorktrees } from "./utils/resolveOpenableWorktrees";

type WorkspaceCreateAgent = AgentDefinitionId | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

type ConvertedFile = {
	data: string;
	mediaType: string;
	filename?: string;
};

interface ProjectOption {
	id: string;
	name: string;
	color: string;
	githubOwner: string | null;
	iconUrl: string | null;
	hideImage: boolean | null;
}

interface PromptGroupProps {
	projectId: string | null;
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onImportRepo: () => void;
	onNewProject: () => void;
}

export function PromptGroup(props: PromptGroupProps) {
	return <PromptGroupInner {...props} />;
}

const PlusMenu = forwardRef<
	HTMLDivElement,
	{
		onOpenIssueLink: () => void;
		onOpenGitHubIssue: () => void;
		onOpenPRLink: () => void;
	}
>(function PlusMenu({ onOpenIssueLink, onOpenGitHubIssue, onOpenPRLink }, ref) {
	const attachments = usePromptInputAttachments();

	return (
		<div ref={ref}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<PromptInputButton className={`${PILL_BUTTON_CLASS} w-[22px]`}>
						<PlusIcon className="size-3.5" />
					</PromptInputButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="bottom" align="start" className="w-52">
					<DropdownMenuItem onSelect={() => attachments.openFileDialog()}>
						<PaperclipIcon className="size-4" />
						Add attachment
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={onOpenIssueLink}>
						<SiLinear className="size-4" />
						Link issue
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={onOpenGitHubIssue}>
						<GoIssueOpened className="size-4" />
						Link GitHub issue
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={onOpenPRLink}>
						<LuGitPullRequest className="size-4" />
						Link pull request
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
});

function ProjectPickerPill({
	selectedProject,
	recentProjects,
	onSelectProject,
	onImportRepo,
	onNewProject,
}: {
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
	onImportRepo: () => void;
	onNewProject: () => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PromptInputButton
					className={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[140px]`}
				>
					{selectedProject && (
						<ProjectThumbnail
							projectId={selectedProject.id}
							projectName={selectedProject.name}
							projectColor={selectedProject.color}
							githubOwner={selectedProject.githubOwner}
							iconUrl={selectedProject.iconUrl}
							hideImage={selectedProject.hideImage ?? false}
							className="!size-3"
						/>
					)}
					<span className="truncate">
						{selectedProject?.name ?? "Select project"}
					</span>
					<HiChevronUpDown className="size-3 shrink-0 text-muted-foreground" />
				</PromptInputButton>
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
										onSelectProject(project.id);
										setOpen(false);
									}}
								>
									<ProjectThumbnail
										projectId={project.id}
										projectName={project.name}
										projectColor={project.color}
										githubOwner={project.githubOwner}
										iconUrl={project.iconUrl}
										hideImage={project.hideImage ?? false}
									/>
									{project.name}
									{project.id === selectedProject?.id && (
										<HiCheck className="ml-auto size-4" />
									)}
								</CommandItem>
							))}
						</CommandGroup>
						<CommandSeparator alwaysRender />
						<CommandGroup forceMount>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onImportRepo();
								}}
							>
								<LuFolderOpen className="size-4" />
								Open project
							</CommandItem>
							<CommandItem
								forceMount
								onSelect={() => {
									setOpen(false);
									onNewProject();
								}}
							>
								<LuFolderGit className="size-4" />
								New project
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function CompareBaseBranchPickerInline({
	effectiveCompareBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branches,
	worktreeBranches,
	openableWorktrees,
	activeWorkspacesByBranch,
	externalWorktreeBranches,
	modKey,
	onSelectCompareBaseBranch,
	onOpenWorktree,
	onOpenActiveWorkspace,
}: {
	effectiveCompareBaseBranch: string | null;
	defaultBranch?: string;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: Array<{ name: string; lastCommitDate: number; isLocal: boolean }>;
	worktreeBranches: Set<string>;
	openableWorktrees: Map<string, OpenableWorktreeAction>;
	activeWorkspacesByBranch: Map<string, string>;
	externalWorktreeBranches: Set<string>;
	modKey: string;
	onSelectCompareBaseBranch: (branchName: string) => void;
	onOpenWorktree: (action: OpenableWorktreeAction) => void;
	onOpenActiveWorkspace: (workspaceId: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [filterMode, setFilterMode] = useState<"all" | "worktrees">("all");

	const filteredBranches = useMemo(() => {
		if (!branches.length) return [];
		if (!branchSearch) return branches;
		const searchLower = branchSearch.toLowerCase();
		return branches.filter((branch) =>
			branch.name.toLowerCase().includes(searchLower),
		);
	}, [branches, branchSearch]);

	const displayBranches = useMemo(() => {
		if (filterMode === "all") return filteredBranches;
		return filteredBranches.filter((b) => worktreeBranches.has(b.name));
	}, [filteredBranches, filterMode, worktreeBranches]);

	if (isBranchesError) {
		return (
			<span className="text-xs text-destructive">Failed to load branches</span>
		);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) {
					setBranchSearch("");
					setFilterMode("all");
				}
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={isBranchesLoading}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0 max-w-full"
				>
					<GoGitBranch className="size-3 shrink-0" />
					{isBranchesLoading ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : (
						<span className="font-mono truncate">
							{effectiveCompareBaseBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-96 p-0"
				align="start"
				onWheel={(event) => event.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<div className="flex items-center gap-0.5 rounded-md bg-muted/40 p-0.5 mx-2 mt-2">
						{(["all", "worktrees"] as const).map((value) => {
							const count =
								value === "all"
									? branches.length
									: branches.filter((b) => worktreeBranches.has(b.name)).length;
							return (
								<button
									key={value}
									type="button"
									onClick={() => setFilterMode(value)}
									className={cn(
										"flex-1 rounded px-2 py-1 text-xs text-center transition-colors",
										filterMode === value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground",
									)}
								>
									{value === "all" ? "All" : "Worktrees"}
									<span className="ml-1 text-foreground/40">{count}</span>
								</button>
							);
						})}
					</div>
					<CommandInput
						placeholder="Search branches..."
						value={branchSearch}
						onValueChange={setBranchSearch}
					/>
					<CommandList className="max-h-[400px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{displayBranches.map((branch) => {
							const openAction = openableWorktrees.get(branch.name);
							const activeWorkspaceId = activeWorkspacesByBranch.get(
								branch.name,
							);
							const isExternal = externalWorktreeBranches.has(branch.name);
							const hasExistingWorkspace = !!(activeWorkspaceId || openAction);

							// Determine icon based on state - all same color
							let icon: React.ReactNode;
							if (activeWorkspaceId) {
								icon = (
									<GoArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else if (openAction) {
								icon = (
									<ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else if (branch.isLocal) {
								icon = (
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
								);
							} else {
								icon = (
									<GoGlobe className="size-3.5 shrink-0 text-muted-foreground" />
								);
							}

							return (
								<CommandItem
									key={branch.name}
									value={branch.name}
									onSelect={() => {
										if (activeWorkspaceId) {
											onOpenActiveWorkspace(activeWorkspaceId);
										} else if (openAction) {
											onOpenWorktree(openAction);
										} else {
											onSelectCompareBaseBranch(branch.name);
										}
										setOpen(false);
									}}
									className="group h-11 flex items-center justify-between gap-3 px-3"
								>
									<span className="flex items-center gap-2.5 truncate flex-1 min-w-0">
										{icon}
										<span className="truncate font-mono text-xs">
											{branch.name}
										</span>

										{/* Inline badges */}
										<span className="flex items-center gap-1.5 shrink-0">
											{branch.name === defaultBranch && (
												<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
													default
												</span>
											)}
											{isExternal && !activeWorkspaceId && (
												<span className="text-[10px] text-muted-foreground/60 bg-muted/60 px-1.5 py-0.5 rounded">
													external
												</span>
											)}
										</span>
									</span>

									{/* Right side: time + buttons */}
									<span className="flex items-center gap-2 shrink-0">
										{branch.lastCommitDate > 0 && (
											<span className="text-[11px] text-muted-foreground/70 group-data-[selected=true]:hidden">
												{formatRelativeTime(branch.lastCommitDate)}
											</span>
										)}

										{/* Show checkmark for selected base branch when not hovering */}
										{!hasExistingWorkspace &&
											effectiveCompareBaseBranch === branch.name && (
												<HiCheck className="size-4 text-primary group-data-[selected=true]:hidden" />
											)}

										{/* Action buttons - show on hover/select */}
										<span className="hidden group-data-[selected=true]:flex items-center gap-1.5">
											{hasExistingWorkspace && (
												<Button
													size="sm"
													variant="ghost"
													className="h-7 px-2.5 text-xs font-medium hover:bg-accent/10 hover:text-accent-foreground"
													onClick={(e) => {
														e.stopPropagation();
														if (activeWorkspaceId) {
															onOpenActiveWorkspace(activeWorkspaceId);
														} else if (openAction) {
															onOpenWorktree(openAction);
														}
														setOpen(false);
													}}
												>
													<GoArrowUpRight className="size-3.5 mr-1" />
													Open
													<span className="ml-1 text-[10px] opacity-60">↵</span>
												</Button>
											)}
											<Button
												size="sm"
												className="h-7 px-2.5 text-xs font-medium"
												onClick={(e) => {
													e.stopPropagation();
													onSelectCompareBaseBranch(branch.name);
													setOpen(false);
												}}
											>
												{hasExistingWorkspace ? (
													<>
														<PlusIcon className="size-3.5 mr-1" />
														Create
														<span className="ml-1 text-[10px] opacity-70">
															{modKey}↵
														</span>
													</>
												) : (
													<>
														Create
														<span className="ml-1 text-[10px] opacity-70">
															↵
														</span>
													</>
												)}
											</Button>
										</span>
									</span>
								</CommandItem>
							);
						})}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function PromptGroupInner({
	projectId,
	selectedProject,
	recentProjects,
	onSelectProject,
	onImportRepo,
	onNewProject,
}: PromptGroupProps) {
	const navigate = useNavigate();
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const isNewWorkspaceModalOpen = useNewWorkspaceModalOpen();
	const utils = electronTrpc.useUtils();
	const {
		closeAndResetDraft,
		closeModal,
		createWorkspace,
		createFromPr,
		openTrackedWorktree,
		openExternalWorktree,
		draft,
		runAsyncAction,
		updateDraft,
	} = useNewWorkspaceModalDraft();
	const attachments = useProviderAttachments();
	const clearPendingWorkspace = useClearPendingWorkspace();
	const setPendingWorkspace = useSetPendingWorkspace();
	const setPendingWorkspaceStatus = useSetPendingWorkspaceStatus();
	const {
		compareBaseBranch,
		prompt,
		runSetupScript,
		workspaceName,
		workspaceNameEdited,
		branchName,
		branchNameEdited,
		linkedIssues,
		linkedPR,
	} = draft;
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
	const selectableAgentIds = useMemo(
		() => enabledAgentPresets.map((preset) => preset.id),
		[enabledAgentPresets],
	);
	const { selectedAgent, setSelectedAgent } =
		useAgentLaunchPreferences<WorkspaceCreateAgent>({
			agentStorageKey: AGENT_STORAGE_KEY,
			defaultAgent: "claude",
			fallbackAgent: "none",
			validAgents: ["none", ...selectableAgentIds],
			agentsReady: agentPresetsQuery.isFetched,
		});
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);
	const [gitHubIssueLinkOpen, setGitHubIssueLinkOpen] = useState(false);
	const [prLinkOpen, setPRLinkOpen] = useState(false);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const submitStartedRef = useRef(false);
	const trimmedPrompt = prompt.trim();
	const firstIssueSlug = linkedIssues[0]?.slug ?? null;

	// AI branch name generation (on submit only)
	const generateBranchNameMutation =
		electronTrpc.workspaces.generateBranchName.useMutation();
	useEffect(() => {
		if (isNewWorkspaceModalOpen) {
			submitStartedRef.current = false;
		}
	}, [isNewWorkspaceModalOpen]);

	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const {
		data: localBranchData,
		isLoading: isLocalBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	// Show local data immediately (fast, no network), upgrade to remote when available
	const branchData = remoteBranchData ?? localBranchData;
	// Only show loading while waiting for the fast local query
	const isBranchesLoading = isLocalBranchesLoading && !branchData;

	const { data: externalWorktrees = [] } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const { data: trackedWorktrees = [] } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery(
			{ projectId: projectId ?? "" },
			{ enabled: !!projectId },
		);

	const worktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) set.add(wt.branch);
		for (const wt of trackedWorktrees) set.add(wt.branch);
		return set;
	}, [externalWorktrees, trackedWorktrees]);

	// Fetch active workspaces for this project
	const { data: activeWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const activeWorkspacesByBranch = useMemo(() => {
		const map = new Map<string, string>(); // branch → workspaceId
		for (const ws of activeWorkspaces) {
			if (ws.projectId === projectId && !ws.deletingAt) {
				map.set(ws.branch, ws.id);
			}
		}
		return map;
	}, [activeWorkspaces, projectId]);

	// Resolve openable worktrees (no active workspace)
	const openableWorktrees = useMemo(
		() => resolveOpenableWorktrees(trackedWorktrees, externalWorktrees),
		[trackedWorktrees, externalWorktrees],
	);

	// Map external worktree paths for badge display
	const externalWorktreeBranches = useMemo(() => {
		const set = new Set<string>();
		for (const wt of externalWorktrees) {
			set.add(wt.branch);
		}
		return set;
	}, [externalWorktrees]);

	const effectiveCompareBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: compareBaseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	const previousProjectIdRef = useRef(projectId);

	useEffect(() => {
		if (previousProjectIdRef.current === projectId) {
			return;
		}
		previousProjectIdRef.current = projectId;
		updateDraft({ compareBaseBranch: null });
	}, [projectId, updateDraft]);

	const buildLaunchRequest = useCallback(
		(prompt: string, files?: ConvertedFile[]): AgentLaunchRequest | null => {
			return buildPromptAgentLaunchRequest({
				workspaceId: "pending-workspace",
				source: "new-workspace",
				selectedAgent,
				prompt,
				initialFiles: files,
				taskSlug: firstIssueSlug || undefined,
				configsById: agentConfigsById,
			});
		},
		[agentConfigsById, firstIssueSlug, selectedAgent],
	);

	const convertBlobUrlToDataUrl = useCallback(
		async (url: string): Promise<string> => {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`Failed to fetch attachment: ${response.statusText}`);
			}
			const blob = await response.blob();
			return new Promise<string>((resolve, reject) => {
				const reader = new FileReader();
				reader.onloadend = () => resolve(reader.result as string);
				reader.onerror = () =>
					reject(new Error("Failed to read attachment data"));
				reader.onabort = () => reject(new Error("Attachment read was aborted"));
				reader.readAsDataURL(blob);
			});
		},
		[],
	);

	const handleCreate = useCallback(async () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}

		if (submitStartedRef.current) {
			return;
		}
		submitStartedRef.current = true;

		const displayName =
			workspaceNameEdited && workspaceName.trim()
				? workspaceName.trim()
				: trimmedPrompt || "New workspace";
		const willGenerateAIName =
			!branchNameEdited && !!trimmedPrompt && !linkedPR;
		const pendingWorkspaceId = crypto.randomUUID();
		const detachedFiles = attachments.takeFiles();

		setPendingWorkspace({
			id: pendingWorkspaceId,
			projectId,
			name: displayName,
			status: willGenerateAIName ? "generating-branch" : "preparing",
		});
		closeAndResetDraft();

		try {
			let aiBranchName: string | null = null;
			if (willGenerateAIName) {
				let timeoutId: NodeJS.Timeout | null = null;
				try {
					const AI_GENERATION_TIMEOUT_MS = 30000;
					const timeoutPromise = new Promise<never>((_, reject) => {
						timeoutId = setTimeout(
							() => reject(new Error("AI generation timeout")),
							AI_GENERATION_TIMEOUT_MS,
						);
					});

					const result = await Promise.race([
						generateBranchNameMutation.mutateAsync({
							prompt: trimmedPrompt,
							projectId,
						}),
						timeoutPromise,
					]);

					if (timeoutId) clearTimeout(timeoutId);
					aiBranchName = result.branchName;
				} catch (error) {
					if (timeoutId) clearTimeout(timeoutId);

					const errorMessage =
						error instanceof Error ? error.message : String(error);
					if (errorMessage.includes("timeout")) {
						console.warn("[PromptGroup] AI generation timeout");
						toast.info("Using random branch name (AI generation timed out)");
					} else if (
						errorMessage.toLowerCase().includes("auth") ||
						errorMessage.includes("401") ||
						errorMessage.includes("403")
					) {
						console.error("[PromptGroup] AI auth error:", error);
						toast.error(
							"AI authentication failed. Please check your AI settings.",
						);
						clearPendingWorkspace(pendingWorkspaceId);
						return;
					} else {
						console.warn("[PromptGroup] AI generation failed:", error);
						toast.info("Using random branch name (AI generation unavailable)");
					}
				} finally {
					setPendingWorkspaceStatus(pendingWorkspaceId, "preparing");
				}
			}

			let convertedFiles: ConvertedFile[] = [];
			if (detachedFiles.length > 0) {
				try {
					convertedFiles = await Promise.all(
						detachedFiles.map(async (file) => ({
							data: await convertBlobUrlToDataUrl(file.url),
							mediaType: file.mediaType,
							filename: file.filename,
						})),
					);
				} catch (err) {
					clearPendingWorkspace(pendingWorkspaceId);
					toast.error(
						err instanceof Error
							? err.message
							: "Failed to process attachments",
					);
					return;
				}
			}

			// Fetch and attach GitHub issue content
			const githubIssues = linkedIssues.filter(
				(issue): issue is typeof issue & { number: number } =>
					issue.source === "github" && typeof issue.number === "number",
			);
			if (githubIssues.length > 0 && projectId) {
				try {
					// Helper to add timeout to promises
					const fetchWithTimeout = <T,>(
						promise: Promise<T>,
						timeoutMs: number,
					): Promise<T> => {
						return Promise.race([
							promise,
							new Promise<T>((_, reject) =>
								setTimeout(
									() => reject(new Error("Request timeout")),
									timeoutMs,
								),
							),
						]);
					};

					const issueContents = await Promise.all(
						githubIssues.map(async (issue) => {
							try {
								const content = await fetchWithTimeout(
									utils.client.projects.getIssueContent.query({
										projectId,
										issueNumber: issue.number,
									}),
									10000, // 10 second timeout per issue
								);

								// Sanitize user-generated content to prevent injection
								const sanitizeText = (str: string) =>
									str.replace(/[&<>"']/g, (char) => {
										const entities: Record<string, string> = {
											"&": "&amp;",
											"<": "&lt;",
											">": "&gt;",
											'"': "&quot;",
											"'": "&#39;",
										};
										return entities[char] || char;
									});

								const sanitizeUrl = (url: string) => {
									try {
										const parsed = new URL(url);
										// Only allow http/https protocols
										if (!["http:", "https:"].includes(parsed.protocol)) {
											return "#invalid-url";
										}
										return url;
									} catch {
										return "#invalid-url";
									}
								};

								// Limit body size to prevent memory issues
								const MAX_BODY_LENGTH = 50000; // 50KB
								const truncatedBody =
									content.body.length > MAX_BODY_LENGTH
										? `${content.body.slice(0, MAX_BODY_LENGTH)}\n\n[... content truncated due to length ...]`
										: content.body;

								const markdown = `# GitHub Issue #${content.number}: ${sanitizeText(content.title)}

**URL:** ${sanitizeUrl(content.url)}
**State:** ${content.state}
**Author:** ${sanitizeText(content.author || "Unknown")}
**Created:** ${content.createdAt ? new Date(content.createdAt).toLocaleString() : "Unknown"}
**Updated:** ${content.updatedAt ? new Date(content.updatedAt).toLocaleString() : "Unknown"}

---

${sanitizeText(truncatedBody)}`;

								// Convert markdown to base64 data URL
								const base64 = btoa(
									encodeURIComponent(markdown).replace(
										/%([0-9A-F]{2})/g,
										(_, p1) => String.fromCharCode(Number.parseInt(p1, 16)),
									),
								);

								return {
									data: `data:text/markdown;base64,${base64}`,
									mediaType: "text/markdown",
									filename: `github-issue-${content.number}.md`,
								};
							} catch (err) {
								console.warn(
									`Failed to fetch GitHub issue #${issue.number}:`,
									err,
								);
								return null;
							}
						}),
					);

					// Add successfully fetched issues to convertedFiles
					const validIssueFiles = issueContents.filter(
						(file) => file !== null,
					) as ConvertedFile[];
					convertedFiles = [...convertedFiles, ...validIssueFiles];
				} catch (err) {
					console.warn("Failed to fetch GitHub issue contents:", err);
					// Don't block workspace creation if issue fetching fails
				}
			}

			let launchRequest: AgentLaunchRequest | null = null;
			try {
				launchRequest = buildLaunchRequest(
					trimmedPrompt,
					convertedFiles.length > 0 ? convertedFiles : undefined,
				);
			} catch (error) {
				clearPendingWorkspace(pendingWorkspaceId);
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to prepare agent launch",
				);
				return;
			}

			setPendingWorkspaceStatus(pendingWorkspaceId, "creating");

			if (linkedPR) {
				void runAsyncAction(
					createFromPr.mutateAsyncWithSetup(
						{ projectId, prUrl: linkedPR.url },
						launchRequest ?? undefined,
					),
					{
						loading: `Creating workspace from PR #${linkedPR.prNumber}...`,
						success: "Workspace created from PR",
						error: (err) =>
							err instanceof Error
								? err.message
								: "Failed to create workspace from PR",
					},
					{ closeAndReset: false },
				).finally(() => {
					clearPendingWorkspace(pendingWorkspaceId);
				});
				return;
			}

			void runAsyncAction(
				createWorkspace.mutateAsyncWithPendingSetup(
					{
						projectId,
						name:
							workspaceNameEdited && workspaceName.trim()
								? workspaceName.trim()
								: undefined,
						prompt: trimmedPrompt || undefined,
						branchName:
							(branchNameEdited && branchName.trim()
								? sanitizeBranchNameWithMaxLength(
										branchName.trim(),
										undefined,
										{
											preserveCase: true,
										},
									)
								: aiBranchName) || undefined,
						compareBaseBranch: compareBaseBranch || undefined,
					},
					{
						agentLaunchRequest: launchRequest ?? undefined,
						resolveInitialCommands: runSetupScript
							? (commands) => commands
							: () => null,
					},
				),
				{
					loading: "Creating workspace...",
					success: "Workspace created",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to create workspace",
				},
				{ closeAndReset: false },
			).finally(() => {
				clearPendingWorkspace(pendingWorkspaceId);
			});
		} finally {
			for (const file of detachedFiles) {
				if (file.url?.startsWith("blob:")) {
					URL.revokeObjectURL(file.url);
				}
			}
		}
	}, [
		attachments,
		compareBaseBranch,
		branchName,
		branchNameEdited,
		buildLaunchRequest,
		closeAndResetDraft,
		clearPendingWorkspace,
		convertBlobUrlToDataUrl,
		createFromPr,
		createWorkspace,
		generateBranchNameMutation,
		linkedIssues,
		linkedPR,
		projectId,
		runAsyncAction,
		runSetupScript,
		setPendingWorkspace,
		setPendingWorkspaceStatus,
		trimmedPrompt,
		utils,
		workspaceName,
		workspaceNameEdited,
	]);

	const handlePromptSubmit = useCallback(() => {
		void handleCreate();
	}, [handleCreate]);

	const handleCompareBaseBranchSelect = (selectedBaseBranch: string) => {
		updateDraft({ compareBaseBranch: selectedBaseBranch });
	};

	const handleOpenWorktree = useCallback(
		(action: OpenableWorktreeAction) => {
			if (!projectId) return;

			if (action.type === "tracked") {
				void runAsyncAction(
					openTrackedWorktree.mutateAsync({
						worktreeId: action.worktreeId,
					}),
					{
						loading: "Opening worktree...",
						success: "Worktree opened",
						error: (err) =>
							err instanceof Error ? err.message : "Failed to open worktree",
					},
				);
			} else {
				void runAsyncAction(
					openExternalWorktree.mutateAsync({
						projectId,
						worktreePath: action.worktreePath,
						branch: action.branch,
					}),
					{
						loading: "Opening worktree...",
						success: "Worktree opened",
						error: (err) =>
							err instanceof Error ? err.message : "Failed to open worktree",
					},
				);
			}
		},
		[
			projectId,
			runAsyncAction,
			openExternalWorktree.mutateAsync,
			openTrackedWorktree.mutateAsync,
		],
	);

	const handleOpenActiveWorkspace = useCallback(
		(workspaceId: string) => {
			closeModal();
			void navigateToWorkspace(workspaceId, navigate);
		},
		[closeModal, navigate],
	);

	const addLinkedIssue = (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
	) => {
		if (linkedIssues.some((issue) => issue.slug === slug)) return;
		updateDraft({
			linkedIssues: [
				...linkedIssues,
				{ slug, title, source: "internal", taskId, url },
			],
		});
	};

	const addLinkedGitHubIssue = (
		issueNumber: number,
		title: string,
		url: string,
		state: string,
	) => {
		// Normalize state to valid type
		const normalizedState: "open" | "closed" =
			state.toLowerCase() === "closed" ? "closed" : "open";

		const issue = {
			slug: `#${issueNumber}`,
			title,
			source: "github" as const,
			url,
			number: issueNumber,
			state: normalizedState,
		};
		// Check for duplicates by URL to handle same issue numbers from different repos
		if (linkedIssues.some((i) => i.url === url)) return;
		updateDraft({ linkedIssues: [...linkedIssues, issue] });
	};

	const removeLinkedIssue = (slug: string) => {
		updateDraft({
			linkedIssues: linkedIssues.filter((issue) => issue.slug !== slug),
		});
	};

	const setLinkedPR = (pr: LinkedPR) => {
		updateDraft({ linkedPR: pr });
	};

	const removeLinkedPR = () => {
		updateDraft({ linkedPR: null });
	};

	return (
		<div className="p-3 space-y-2">
			<div className="flex items-center">
				<Input
					className="border-none bg-transparent text-base font-medium px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40 min-w-0 flex-1"
					placeholder="Workspace name (optional)"
					value={workspaceName}
					onChange={(e) =>
						updateDraft({
							workspaceName: e.target.value,
							workspaceNameEdited: true,
						})
					}
					onBlur={() => {
						if (!workspaceName.trim()) {
							updateDraft({ workspaceName: "", workspaceNameEdited: false });
						}
					}}
				/>
				<div className="shrink min-w-0 ml-auto max-w-[50%]">
					<Input
						className={cn(
							"border-none bg-transparent text-xs font-mono text-muted-foreground/60 px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/30 focus:text-muted-foreground text-right placeholder:text-right overflow-hidden text-ellipsis",
						)}
						placeholder="branch name"
						value={branchName}
						onChange={(e) =>
							updateDraft({
								branchName: e.target.value.replace(/\s+/g, "-"),
								branchNameEdited: true,
							})
						}
						onBlur={() => {
							const sanitized = sanitizeBranchNameWithMaxLength(
								branchName.trim(),
								undefined,
								{ preserveCase: true },
							);
							if (!sanitized) {
								updateDraft({ branchName: "", branchNameEdited: false });
							} else {
								updateDraft({ branchName: sanitized });
							}
						}}
					/>
				</div>
			</div>

			<PromptInput
				onSubmit={handlePromptSubmit}
				multiple
				maxFiles={5}
				maxFileSize={10 * 1024 * 1024}
				className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
			>
				{(linkedPR ||
					linkedIssues.length > 0 ||
					attachments.files.length > 0) && (
					<div className="flex flex-wrap items-start gap-2 px-3 pt-3 self-stretch">
						<AnimatePresence initial={false}>
							{linkedPR && (
								<motion.div
									key="linked-pr"
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: 0.15 }}
								>
									<LinkedPRPill
										prNumber={linkedPR.prNumber}
										title={linkedPR.title}
										state={linkedPR.state}
										onRemove={removeLinkedPR}
									/>
								</motion.div>
							)}
							{linkedIssues.map((issue) => (
								<motion.div
									key={issue.slug}
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: 0.15 }}
								>
									{issue.source === "github" ? (
										<LinkedGitHubIssuePill
											issueNumber={issue.number ?? 0}
											title={issue.title}
											state={issue.state ?? "open"}
											onRemove={() => removeLinkedIssue(issue.slug)}
										/>
									) : (
										<LinkedIssuePill
											slug={issue.slug}
											title={issue.title}
											url={issue.url}
											taskId={issue.taskId}
											onRemove={() => removeLinkedIssue(issue.slug)}
										/>
									)}
								</motion.div>
							))}
						</AnimatePresence>
						<PromptInputAttachments>
							{(file) => <PromptInputAttachment data={file} />}
						</PromptInputAttachments>
					</div>
				)}
				<PromptInputTextarea
					autoFocus
					placeholder="What do you want to do?"
					className="min-h-10"
					value={prompt}
					onChange={(e) => updateDraft({ prompt: e.target.value })}
					onKeyDown={(e) => {
						if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
							e.preventDefault();
							void handleCreate();
						}
					}}
				/>
				<PromptInputFooter>
					<PromptInputTools className="gap-1.5">
						<AgentSelect<WorkspaceCreateAgent>
							agents={enabledAgentPresets}
							value={selectedAgent}
							placeholder="No agent"
							onValueChange={setSelectedAgent}
							onBeforeConfigureAgents={closeModal}
							triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
							iconClassName="size-3 object-contain"
							allowNone
							noneLabel="No agent"
							noneValue="none"
						/>
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu
							ref={plusMenuRef}
							onOpenIssueLink={() =>
								requestAnimationFrame(() => setIssueLinkOpen(true))
							}
							onOpenGitHubIssue={() =>
								requestAnimationFrame(() => setGitHubIssueLinkOpen(true))
							}
							onOpenPRLink={() =>
								requestAnimationFrame(() => setPRLinkOpen(true))
							}
						/>
						<IssueLinkCommand
							variant="popover"
							anchorRef={plusMenuRef}
							open={issueLinkOpen}
							onOpenChange={setIssueLinkOpen}
							onSelect={addLinkedIssue}
						/>
						<GitHubIssueLinkCommand
							open={gitHubIssueLinkOpen}
							onOpenChange={setGitHubIssueLinkOpen}
							onSelect={(issue) =>
								addLinkedGitHubIssue(
									issue.issueNumber,
									issue.title,
									issue.url,
									issue.state,
								)
							}
							projectId={projectId}
							anchorRef={plusMenuRef}
						/>
						<PRLinkCommand
							open={prLinkOpen}
							onOpenChange={setPRLinkOpen}
							onSelect={setLinkedPR}
							projectId={projectId}
							anchorRef={plusMenuRef}
						/>
						<PromptInputSubmit
							className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
							onClick={(e) => {
								e.preventDefault();
								void handleCreate();
							}}
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>

			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<ProjectPickerPill
						selectedProject={selectedProject}
						recentProjects={recentProjects}
						onSelectProject={onSelectProject}
						onImportRepo={onImportRepo}
						onNewProject={onNewProject}
					/>
					<AnimatePresence mode="wait" initial={false}>
						{linkedPR ? (
							<motion.span
								key="linked-pr-label"
								initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
								animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
								exit={{ opacity: 0, x: 8, filter: "blur(4px)" }}
								transition={{ duration: 0.2, ease: "easeOut" }}
								className="flex items-center gap-1 text-xs text-muted-foreground"
							>
								<LuGitPullRequest className="size-3 shrink-0" />
								based off PR #{linkedPR.prNumber}
							</motion.span>
						) : (
							<motion.div
								key="branch-picker"
								className="min-w-0"
								initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
								animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
								exit={{ opacity: 0, x: 8, filter: "blur(4px)" }}
								transition={{ duration: 0.2, ease: "easeOut" }}
							>
								<CompareBaseBranchPickerInline
									effectiveCompareBaseBranch={effectiveCompareBaseBranch}
									defaultBranch={branchData?.defaultBranch}
									isBranchesLoading={isBranchesLoading}
									isBranchesError={isBranchesError}
									branches={branchData?.branches ?? []}
									worktreeBranches={worktreeBranches}
									openableWorktrees={openableWorktrees}
									activeWorkspacesByBranch={activeWorkspacesByBranch}
									externalWorktreeBranches={externalWorktreeBranches}
									modKey={modKey}
									onSelectCompareBaseBranch={handleCompareBaseBranchSelect}
									onOpenWorktree={handleOpenWorktree}
									onOpenActiveWorkspace={handleOpenActiveWorkspace}
								/>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
				<span className="text-[11px] text-muted-foreground/50">
					{modKey}+↵ to create
				</span>
			</div>
		</div>
	);
}
