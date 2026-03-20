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
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowUpIcon,
	Loader2Icon,
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
import { GoGitBranch } from "react-icons/go";
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
import { ProjectThumbnail } from "renderer/screens/main/components/WorkspaceSidebar/ProjectSection/ProjectThumbnail";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import {
	useSetIsGeneratingBranchName,
	useSetPendingWorkspace,
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
import { LinkedPRPill } from "./components/LinkedPRPill";
import { PRLinkCommand } from "./components/PRLinkCommand";

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
	{ onOpenIssueLink: () => void; onOpenPRLink: () => void }
>(function PlusMenu({ onOpenIssueLink, onOpenPRLink }, ref) {
	const attachments = usePromptInputAttachments();

	return (
		<div ref={ref}>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<PromptInputButton className={`${PILL_BUTTON_CLASS} w-[22px]`}>
						<PlusIcon className="size-3.5" />
					</PromptInputButton>
				</DropdownMenuTrigger>
				<DropdownMenuContent side="top" align="end" className="w-52">
					<DropdownMenuItem onSelect={() => attachments.openFileDialog()}>
						<PaperclipIcon className="size-4" />
						Add attachment
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={onOpenIssueLink}>
						<SiLinear className="size-4" />
						Link issue
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

function BaseBranchPickerInline({
	effectiveBaseBranch,
	defaultBranch,
	isBranchesLoading,
	isBranchesError,
	branches,
	worktreeBranches,
	onSelectBaseBranch,
}: {
	effectiveBaseBranch: string | null;
	defaultBranch?: string;
	isBranchesLoading: boolean;
	isBranchesError: boolean;
	branches: Array<{ name: string; lastCommitDate: number }>;
	worktreeBranches: Set<string>;
	onSelectBaseBranch: (branchName: string) => void;
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
							{effectiveBaseBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-64 p-0"
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
					<CommandList className="max-h-[200px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{displayBranches.map((branch) => (
							<CommandItem
								key={branch.name}
								value={branch.name}
								onSelect={() => {
									onSelectBaseBranch(branch.name);
									setOpen(false);
								}}
								className="flex items-center justify-between"
							>
								<span className="flex items-center gap-2 truncate">
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate">{branch.name}</span>
									{branch.name === defaultBranch && (
										<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
											default
										</span>
									)}
								</span>
								<span className="flex items-center gap-2 shrink-0">
									{branch.lastCommitDate > 0 && (
										<span className="text-xs text-muted-foreground">
											{formatRelativeTime(branch.lastCommitDate)}
										</span>
									)}
									{effectiveBaseBranch === branch.name && (
										<HiCheck className="size-4 text-primary" />
									)}
								</span>
							</CommandItem>
						))}
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
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const {
		closeModal,
		createWorkspace,
		createFromPr,
		draft,
		runAsyncAction,
		updateDraft,
	} = useNewWorkspaceModalDraft();
	const attachments = useProviderAttachments();
	const setPendingWorkspace = useSetPendingWorkspace();
	const setIsGeneratingBranchNameGlobal = useSetIsGeneratingBranchName();
	const {
		baseBranch,
		prompt,
		runSetupScript,
		workspaceName,
		workspaceNameEdited,
		branchName,
		branchNameEdited,
		linkedIssues,
		linkedPR,
	} = draft;
	const runSetupScriptRef = useRef(runSetupScript);
	runSetupScriptRef.current = runSetupScript;
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
	const [prLinkOpen, setPRLinkOpen] = useState(false);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const trimmedPrompt = prompt.trim();
	const firstIssueSlug = linkedIssues[0]?.slug ?? null;

	// AI branch name generation (on submit only)
	const generateBranchNameMutation =
		electronTrpc.workspaces.generateBranchName.useMutation();
	const [isGeneratingBranchName, setIsGeneratingBranchName] = useState(false);

	// Track component mount state for cleanup
	const isMountedRef = useRef(true);
	useEffect(() => {
		return () => {
			isMountedRef.current = false;
		};
	}, []);

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

	const effectiveBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: baseBranch,
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
		updateDraft({ baseBranch: null });
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

		// Prevent re-entry while generation/creation is in flight
		if (
			isGeneratingBranchName ||
			generateBranchNameMutation.isPending ||
			createWorkspace.isPending ||
			createFromPr.isPending
		) {
			return;
		}

		// Set pending workspace immediately for suspense UI
		const displayName =
			workspaceNameEdited && workspaceName.trim()
				? workspaceName.trim()
				: trimmedPrompt || "New workspace";

		const willGenerateAIName =
			!branchNameEdited && !!trimmedPrompt && !linkedPR;

		setPendingWorkspace({
			projectId,
			name: displayName,
			isGeneratingBranchName: willGenerateAIName,
		});

		// Generate AI branch name if needed (before creating workspace)
		let aiBranchName: string | null = null;
		if (willGenerateAIName) {
			setIsGeneratingBranchName(true);
			let timeoutId: NodeJS.Timeout | null = null;
			try {
				// Add timeout to prevent hanging indefinitely
				const AI_GENERATION_TIMEOUT_MS = 30000; // 30 seconds
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

				// Clear timeout on successful completion
				if (timeoutId) clearTimeout(timeoutId);
				aiBranchName = result.branchName;
			} catch (error) {
				// Clear timeout on error
				if (timeoutId) clearTimeout(timeoutId);

				// Distinguish error types for better user feedback
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
					setPendingWorkspace(null);
					return; // Don't continue with workspace creation on auth errors
				} else {
					console.warn("[PromptGroup] AI generation failed:", error);
					toast.info("Using random branch name (AI generation unavailable)");
				}
				// Continue with workspace creation - backend will use random name
			} finally {
				// Always clear global state to prevent stuck "Generating..." in sidebar
				setIsGeneratingBranchNameGlobal(false);
				// Only update local state if component is still mounted
				if (isMountedRef.current) {
					setIsGeneratingBranchName(false);
				}
			}
		}

		let convertedFiles: ConvertedFile[] | undefined;
		if (attachments.files.length > 0) {
			try {
				convertedFiles = await Promise.all(
					attachments.files.map(async (file) => ({
						data: await convertBlobUrlToDataUrl(file.url),
						mediaType: file.mediaType,
						filename: file.filename,
					})),
				);
			} catch (err) {
				setPendingWorkspace(null);
				toast.error(
					err instanceof Error ? err.message : "Failed to process attachments",
				);
				return;
			}
		}

		let launchRequest: AgentLaunchRequest | null = null;
		try {
			launchRequest = buildLaunchRequest(trimmedPrompt, convertedFiles);
		} catch (error) {
			setPendingWorkspace(null);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to prepare agent launch",
			);
			return;
		}

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
			).finally(() => {
				setPendingWorkspace(null);
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
							? sanitizeBranchNameWithMaxLength(branchName.trim(), undefined, {
									preserveCase: true,
								})
							: aiBranchName) || undefined,
					baseBranch: baseBranch || undefined,
				},
				{
					agentLaunchRequest: launchRequest ?? undefined,
					resolveInitialCommands: (commands) =>
						runSetupScriptRef.current ? commands : null,
				},
			),
			{
				loading: isGeneratingBranchName
					? "Generating branch name..."
					: "Creating workspace...",
				success: "Workspace created",
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		).finally(() => {
			setPendingWorkspace(null);
		});
	}, [
		attachments.files,
		baseBranch,
		branchName,
		branchNameEdited,
		buildLaunchRequest,
		convertBlobUrlToDataUrl,
		createFromPr,
		createWorkspace,
		generateBranchNameMutation,
		isGeneratingBranchName,
		linkedPR,
		projectId,
		runAsyncAction,
		setPendingWorkspace,
		trimmedPrompt,
		workspaceName,
		workspaceNameEdited,
		setIsGeneratingBranchNameGlobal,
	]);

	const handlePromptSubmit = useCallback(() => {
		void handleCreate();
	}, [handleCreate]);

	const handleBaseBranchSelect = (selectedBaseBranch: string) => {
		updateDraft({ baseBranch: selectedBaseBranch });
	};

	const addLinkedIssue = (slug: string, title: string) => {
		if (linkedIssues.some((issue) => issue.slug === slug)) return;
		updateDraft({ linkedIssues: [...linkedIssues, { slug, title }] });
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
							isGeneratingBranchName &&
								!branchNameEdited &&
								"animate-pulse placeholder:animate-pulse",
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
									<LinkedIssuePill
										slug={issue.slug}
										title={issue.title}
										onRemove={() => removeLinkedIssue(issue.slug)}
									/>
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
						<PRLinkCommand
							open={prLinkOpen}
							onOpenChange={setPRLinkOpen}
							onSelect={setLinkedPR}
							projectId={projectId}
							anchorRef={plusMenuRef}
						/>
						<PromptInputSubmit
							className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
							disabled={createWorkspace.isPending || createFromPr.isPending}
							onClick={(e) => {
								e.preventDefault();
								void handleCreate();
							}}
						>
							{createWorkspace.isPending || createFromPr.isPending ? (
								<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
							) : (
								<ArrowUpIcon className="size-3.5 text-muted-foreground" />
							)}
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
								<BaseBranchPickerInline
									effectiveBaseBranch={effectiveBaseBranch}
									defaultBranch={branchData?.defaultBranch}
									isBranchesLoading={isBranchesLoading}
									isBranchesError={isBranchesError}
									branches={branchData?.branches ?? []}
									worktreeBranches={worktreeBranches}
									onSelectBaseBranch={handleBaseBranchSelect}
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
