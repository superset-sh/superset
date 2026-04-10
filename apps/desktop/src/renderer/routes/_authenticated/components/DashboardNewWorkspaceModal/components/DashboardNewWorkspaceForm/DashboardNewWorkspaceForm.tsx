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
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { GoGitBranch, GoIssueOpened } from "react-icons/go";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { AgentSelect } from "renderer/components/AgentSelect";
import { LinkedIssuePill } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { GitHubIssueLinkCommand } from "renderer/components/NewWorkspaceModal/components/PromptGroup/components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "renderer/components/NewWorkspaceModal/components/PromptGroup/components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "renderer/components/NewWorkspaceModal/components/PromptGroup/components/LinkedPRPill";
import { PRLinkCommand } from "renderer/components/NewWorkspaceModal/components/PromptGroup/components/PRLinkCommand";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { PLATFORM } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type AgentDefinitionId,
	getEnabledAgentConfigs,
} from "shared/utils/agent-settings";
import { sanitizeBranchNameWithMaxLength } from "shared/utils/branch";
import {
	type LinkedPR,
	useDashboardNewWorkspaceDraft,
} from "../../DashboardNewWorkspaceDraftContext";
import { useCreateDashboardWorkspace } from "../../hooks/useCreateDashboardWorkspace";
import { DevicePicker } from "./components/DevicePicker";
import { ProjectSelector } from "./components/ProjectSelector";
import { useBranchContext } from "./hooks/useBranchContext";
import { useDashboardNewWorkspaceProjectSelection } from "./hooks/useDashboardNewWorkspaceProjectSelection";

type WorkspaceCreateAgent = AgentDefinitionId | "none";
type LinkCommand = "issue" | "github-issue" | "pr";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";
const PILL_BUTTON_CLASS =
	"!h-[22px] min-h-0 rounded-md border-[0.5px] border-border bg-foreground/[0.04] shadow-none text-[11px]";

// ── Small sub-components ─────────────────────────────────────────────

function AttachmentButtons({
	anchorRef,
	onOpen,
}: {
	anchorRef: React.RefObject<HTMLDivElement | null>;
	onOpen: (cmd: LinkCommand) => void;
}) {
	const attachments = usePromptInputAttachments();
	return (
		<div ref={anchorRef} className="flex items-center gap-1">
			<Tooltip>
				<TooltipTrigger asChild>
					<PromptInputButton
						className={`${PILL_BUTTON_CLASS} w-[22px]`}
						onClick={() => attachments.openFileDialog()}
					>
						<PaperclipIcon className="size-3.5" />
					</PromptInputButton>
				</TooltipTrigger>
				<TooltipContent side="bottom">Add attachment</TooltipContent>
			</Tooltip>
			{(
				[
					["issue", SiLinear, "Link issue"],
					["github-issue", GoIssueOpened, "Link GitHub issue"],
					["pr", LuGitPullRequest, "Link pull request"],
				] as const
			).map(([cmd, Icon, label]) => (
				<Tooltip key={cmd}>
					<TooltipTrigger asChild>
						<PromptInputButton
							className={`${PILL_BUTTON_CLASS} w-[22px]`}
							onClick={() => onOpen(cmd)}
						>
							<Icon className="size-3.5" />
						</PromptInputButton>
					</TooltipTrigger>
					<TooltipContent side="bottom">{label}</TooltipContent>
				</Tooltip>
			))}
		</div>
	);
}

function CompareBaseBranchPicker({
	effectiveBranch,
	defaultBranch,
	isLoading,
	isError,
	branches,
	onSelect,
}: {
	effectiveBranch: string | null;
	defaultBranch?: string | null;
	isLoading: boolean;
	isError: boolean;
	branches: Array<{ name: string }>;
	onSelect: (name: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		if (!search) return branches;
		const q = search.toLowerCase();
		return branches.filter((b) => b.name.toLowerCase().includes(q));
	}, [branches, search]);

	if (isError) {
		return (
			<span className="text-xs text-destructive">Failed to load branches</span>
		);
	}

	return (
		<Popover
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) setSearch("");
			}}
		>
			<PopoverTrigger asChild>
				<button
					type="button"
					disabled={isLoading}
					className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 min-w-0 max-w-full"
				>
					<GoGitBranch className="size-3 shrink-0" />
					{isLoading ? (
						<span className="h-2.5 w-14 rounded-sm bg-muted-foreground/15 animate-pulse" />
					) : (
						<span className="font-mono truncate">
							{effectiveBranch || "..."}
						</span>
					)}
					<HiChevronUpDown className="size-3 shrink-0" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-80 p-0"
				align="start"
				onWheel={(e) => e.stopPropagation()}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search branches..."
						value={search}
						onValueChange={setSearch}
					/>
					<CommandList className="max-h-[300px]">
						<CommandEmpty>No branches found</CommandEmpty>
						{filtered.map((branch) => (
							<CommandItem
								key={branch.name}
								value={branch.name}
								onSelect={() => {
									onSelect(branch.name);
									setOpen(false);
								}}
								className="flex items-center justify-between"
							>
								<span className="flex items-center gap-2 truncate">
									<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
									<span className="truncate font-mono text-xs">
										{branch.name}
									</span>
									{branch.name === defaultBranch && (
										<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
											default
										</span>
									)}
								</span>
								{effectiveBranch === branch.name && (
									<HiCheck className="size-4 text-primary" />
								)}
							</CommandItem>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

// ── Main Form ────────────────────────────────────────────────────────

interface DashboardNewWorkspaceFormProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

export function DashboardNewWorkspaceForm({
	isOpen,
	preSelectedProjectId,
}: DashboardNewWorkspaceFormProps) {
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	const { closeAndResetDraft, closeModal, draft, updateDraft } =
		useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const [activeLinkCommand, setActiveLinkCommand] =
		useState<LinkCommand | null>(null);

	const {
		compareBaseBranch,
		prompt,
		workspaceName,
		workspaceNameEdited,
		branchName,
		branchNameEdited,
		linkedIssues,
		linkedPR,
		hostTarget,
		runSetupScript,
	} = draft;

	// ── Project selection ────────────────────────────────────────────
	const handleSelectProject = useCallback(
		(projectId: string | null) => {
			updateDraft({ selectedProjectId: projectId, compareBaseBranch: null });
		},
		[updateDraft],
	);
	useDashboardNewWorkspaceProjectSelection({
		isOpen,
		preSelectedProjectId,
		selectedProjectId: draft.selectedProjectId,
		onSelectProject: handleSelectProject,
	});

	// ── Agent presets ────────────────────────────────────────────────
	const agentPresetsQuery = electronTrpc.settings.getAgentPresets.useQuery();
	const enabledAgentPresets = useMemo(
		() => getEnabledAgentConfigs(agentPresetsQuery.data ?? []),
		[agentPresetsQuery.data],
	);
	const selectableAgentIds = useMemo(
		() => enabledAgentPresets.map((p) => p.id),
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

	// ── Branch data (via host-service) ───────────────────────────────
	const {
		data: branchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = useBranchContext(draft.selectedProjectId, hostTarget);

	const effectiveCompareBaseBranch =
		compareBaseBranch || branchData?.defaultBranch || null;

	// ── Create workspace ─────────────────────────────────────────────
	const { createWorkspace, isPending } = useCreateDashboardWorkspace();

	const handleCreate = useCallback(() => {
		if (!draft.selectedProjectId) {
			toast.error("Select a project first");
			return;
		}
		const detachedFiles = attachments.takeFiles();
		closeAndResetDraft();

		void createWorkspace({
			projectId: draft.selectedProjectId,
			hostTarget,
			prompt,
			workspaceName: workspaceNameEdited ? workspaceName : undefined,
			branchName,
			branchNameEdited,
			compareBaseBranch: compareBaseBranch || undefined,
			runSetupScript,
			linkedPR,
			linkedIssues,
			attachmentFiles: detachedFiles,
		});
	}, [
		attachments,
		branchName,
		branchNameEdited,
		closeAndResetDraft,
		compareBaseBranch,
		createWorkspace,
		draft.selectedProjectId,
		hostTarget,
		linkedIssues,
		linkedPR,
		prompt,
		runSetupScript,
		workspaceName,
		workspaceNameEdited,
	]);

	// ── Issue / PR linking ───────────────────────────────────────────

	const addLinkedIssue = (
		slug: string,
		title: string,
		taskId: string | undefined,
		url?: string,
	) => {
		if (linkedIssues.some((i) => i.slug === slug)) return;
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
		if (linkedIssues.some((i) => i.url === url)) return;
		updateDraft({
			linkedIssues: [
				...linkedIssues,
				{
					slug: `#${issueNumber}`,
					title,
					source: "github" as const,
					url,
					number: issueNumber,
					state: state.toLowerCase() === "closed" ? "closed" : "open",
				},
			],
		});
	};

	const removeLinkedIssue = (slug: string) =>
		updateDraft({
			linkedIssues: linkedIssues.filter((i) => i.slug !== slug),
		});

	const setLinkedPR = (pr: LinkedPR) => updateDraft({ linkedPR: pr });
	const removeLinkedPR = () => updateDraft({ linkedPR: null });

	const openLinkCommand = (cmd: LinkCommand) =>
		requestAnimationFrame(() => setActiveLinkCommand(cmd));

	// ── Render ────────────────────────────────────────────────────────

	return (
		<div className="p-3 space-y-2">
			{/* Workspace name + branch name */}
			<div className="flex items-center">
				<Input
					className="border-none bg-transparent dark:bg-transparent shadow-none text-base font-medium px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40 min-w-0 flex-1"
					placeholder="Workspace name (optional)"
					value={workspaceName}
					onChange={(e) =>
						updateDraft({
							workspaceName: e.target.value,
							workspaceNameEdited: true,
						})
					}
					onBlur={() => {
						if (!workspaceName.trim())
							updateDraft({ workspaceName: "", workspaceNameEdited: false });
					}}
				/>
				<div className="shrink min-w-0 ml-auto max-w-[50%]">
					<Input
						className={cn(
							"border-none bg-transparent dark:bg-transparent shadow-none text-xs font-mono text-muted-foreground/60 px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/30 focus:text-muted-foreground text-right placeholder:text-right overflow-hidden text-ellipsis",
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
							if (!sanitized)
								updateDraft({ branchName: "", branchNameEdited: false });
							else updateDraft({ branchName: sanitized });
						}}
					/>
				</div>
			</div>

			{/* Rich prompt input */}
			<PromptInput
				onSubmit={handleCreate}
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
						<AttachmentButtons
							anchorRef={plusMenuRef}
							onOpen={openLinkCommand}
						/>
						<IssueLinkCommand
							variant="popover"
							anchorRef={plusMenuRef}
							open={activeLinkCommand === "issue"}
							onOpenChange={(open) => !open && setActiveLinkCommand(null)}
							onSelect={addLinkedIssue}
						/>
						<GitHubIssueLinkCommand
							open={activeLinkCommand === "github-issue"}
							onOpenChange={(open) => !open && setActiveLinkCommand(null)}
							onSelect={(issue) =>
								addLinkedGitHubIssue(
									issue.issueNumber,
									issue.title,
									issue.url,
									issue.state,
								)
							}
							projectId={null}
							anchorRef={plusMenuRef}
						/>
						<PRLinkCommand
							open={activeLinkCommand === "pr"}
							onOpenChange={(open) => !open && setActiveLinkCommand(null)}
							onSelect={setLinkedPR}
							projectId={null}
							githubOwner={null}
							repoName={null}
							anchorRef={plusMenuRef}
						/>
						<PromptInputSubmit
							className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
							disabled={isPending}
							onClick={(e) => {
								e.preventDefault();
								handleCreate();
							}}
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>

			{/* Bottom bar */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<ProjectSelector
						selectedProjectId={draft.selectedProjectId}
						onSelectProject={handleSelectProject}
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
						) : branchData ? (
							<motion.div
								key="branch-picker"
								className="min-w-0"
								initial={{ opacity: 0, x: -8, filter: "blur(4px)" }}
								animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
								exit={{ opacity: 0, x: 8, filter: "blur(4px)" }}
								transition={{ duration: 0.2, ease: "easeOut" }}
							>
								<CompareBaseBranchPicker
									effectiveBranch={effectiveCompareBaseBranch}
									defaultBranch={branchData.defaultBranch}
									isLoading={isBranchesLoading}
									isError={isBranchesError}
									branches={branchData.branches}
									onSelect={(branch) =>
										updateDraft({ compareBaseBranch: branch })
									}
								/>
							</motion.div>
						) : null}
					</AnimatePresence>
				</div>
				<div className="flex items-center gap-1.5">
					<DevicePicker
						hostTarget={hostTarget}
						onSelectHostTarget={(t) => updateDraft({ hostTarget: t })}
					/>
					<span className="text-[11px] text-muted-foreground/50">
						{modKey}↵
					</span>
				</div>
			</div>
		</div>
	);
}
