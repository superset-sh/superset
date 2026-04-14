import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Input } from "@superset/ui/input";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuGitPullRequest } from "react-icons/lu";
import { AgentSelect } from "renderer/components/AgentSelect";
import { LinkedIssuePill } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { PLATFORM } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceModalOpen } from "renderer/stores/new-workspace-modal";
import { getEnabledAgentConfigs } from "shared/utils/agent-settings";
import { sanitizeUserBranchName, slugifyForBranch } from "shared/utils/branch";
import type { LinkedPR } from "../../../DashboardNewWorkspaceDraftContext";
import { useDashboardNewWorkspaceDraft } from "../../../DashboardNewWorkspaceDraftContext";
import { DevicePicker } from "../components/DevicePicker";
import { type BranchFilter, useBranchContext } from "../hooks/useBranchContext";
import { AttachmentButtons } from "./components/AttachmentButtons";
import { CompareBaseBranchPicker } from "./components/CompareBaseBranchPicker";
import { GitHubIssueLinkCommand } from "./components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "./components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "./components/LinkedPRPill";
import { PRLinkCommand } from "./components/PRLinkCommand";
import { ProjectPickerPill } from "./components/ProjectPickerPill";
import { useSubmitWorkspace } from "./hooks/useSubmitWorkspace";
import {
	AGENT_STORAGE_KEY,
	PILL_BUTTON_CLASS,
	type ProjectOption,
	type WorkspaceCreateAgent,
} from "./types";

interface PromptGroupProps {
	projectId: string | null;
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	onSelectProject: (projectId: string) => void;
}

export function PromptGroup(props: PromptGroupProps) {
	return <PromptGroupInner {...props} />;
}

function PromptGroupInner({
	projectId,
	selectedProject,
	recentProjects,
	onSelectProject,
}: PromptGroupProps) {
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	const isNewWorkspaceModalOpen = useNewWorkspaceModalOpen();
	const { closeModal, draft, updateDraft } = useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const {
		baseBranch,
		hostTarget,
		prompt,
		workspaceName,
		branchName,
		branchNameEdited,
		linkedIssues,
		linkedPR,
	} = draft;

	// ── Agent presets ────────────────────────────────────────────────
	const agentPresetsQuery = electronTrpc.settings.getAgentPresets.useQuery();
	const enabledAgentPresets = useMemo(
		() => getEnabledAgentConfigs(agentPresetsQuery.data ?? []),
		[agentPresetsQuery.data],
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

	// ── Link commands ────────────────────────────────────────────────
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);
	const [gitHubIssueLinkOpen, setGitHubIssueLinkOpen] = useState(false);
	const [prLinkOpen, setPRLinkOpen] = useState(false);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const trimmedPrompt = prompt.trim();

	// ── Branch data ──────────────────────────────────────────────────
	const [branchSearch, setBranchSearch] = useState("");
	const [branchFilter, setBranchFilter] = useState<BranchFilter>("branch");
	const {
		branches,
		defaultBranch,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
		isFetchingNextPage,
		hasNextPage,
		fetchNextPage,
	} = useBranchContext(projectId, hostTarget, branchSearch, branchFilter);

	const effectiveCompareBaseBranch = baseBranch || defaultBranch || null;

	const branchPreview = branchNameEdited
		? sanitizeUserBranchName(branchName)
		: slugifyForBranch(trimmedPrompt);

	// Reset baseBranch on project or host change
	const previousProjectIdRef = useRef(projectId);
	const previousHostRef = useRef(JSON.stringify(hostTarget));
	useEffect(() => {
		const nextHost = JSON.stringify(hostTarget);
		if (
			previousProjectIdRef.current !== projectId ||
			previousHostRef.current !== nextHost
		) {
			previousProjectIdRef.current = projectId;
			previousHostRef.current = nextHost;
			updateDraft({ baseBranch: null, baseBranchSource: null });
		}
	}, [projectId, hostTarget, updateDraft]);

	// ── Per-row actions (Open / Check out / Adopt) ─────────────────────
	// Mutations live on the pending page now; this component only inserts
	// pending rows and navigates. See ../../../DESIGN.md §3.
	const navigate = useNavigate();
	const collections = useCollections();

	const { data: projectWorkspaces } = useLiveQuery(
		(q) => q.from({ workspaces: collections.v2Workspaces }),
		[collections],
	);
	const { data: allHosts } = useLiveQuery(
		(q) => q.from({ hosts: collections.v2Hosts }),
		[collections],
	);
	const { machineId } = useLocalHostService();

	// Resolve the host id matching the current `hostTarget`. Rows in
	// `v2Workspaces` are keyed by host id, so collapsing only by branch name
	// would collide across hosts that happen to share a branch.
	const targetHostId = useMemo<string | null>(() => {
		if (hostTarget.kind === "host") return hostTarget.hostId;
		if (!machineId || !allHosts) return null;
		return allHosts.find((h) => h.machineId === machineId)?.id ?? null;
	}, [hostTarget, allHosts, machineId]);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		if (!projectId || !projectWorkspaces || !targetHostId) return map;
		for (const w of projectWorkspaces) {
			if (w.projectId === projectId && w.hostId === targetHostId && w.branch) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [projectId, projectWorkspaces, targetHostId]);

	const handleOpenExisting = useCallback(
		(branchName: string) => {
			const workspaceId = workspaceByBranch.get(branchName);
			if (!workspaceId) {
				toast.error("Could not find existing workspace for this branch");
				return;
			}
			closeModal();
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId },
			});
		},
		[workspaceByBranch, closeModal, navigate],
	);

	// Respect the user's typed workspace name when set. The picker actions
	// (Create / Check out) bypass the modal submit, so they don't get the
	// resolveNames pass — fall back to the branch name explicitly.
	const resolveActionWorkspaceName = useCallback(
		(branchName: string) => workspaceName.trim() || branchName,
		[workspaceName],
	);

	// All three intents (fork, checkout, adopt) follow the same shape now:
	// insert a pending row + close modal + navigate. The pending page owns
	// the actual host-service mutation. See ../../../DESIGN.md §3.
	const insertPendingAndNavigate = useCallback(
		(row: {
			pendingId: string;
			intent: "checkout" | "adopt";
			workspaceName: string;
			branchName: string;
		}) => {
			if (!projectId) {
				toast.error("Select a project first");
				return;
			}
			collections.pendingWorkspaces.insert({
				id: row.pendingId,
				projectId,
				intent: row.intent,
				name: row.workspaceName,
				branchName: row.branchName,
				prompt: "",
				baseBranch: null,
				baseBranchSource: null,
				runSetupScript: draft.runSetupScript,
				linkedIssues: [],
				linkedPR: null,
				hostTarget,
				attachmentCount: 0,
				status: "creating",
				error: null,
				workspaceId: null,
				warnings: [],
				createdAt: new Date(),
			});
			closeModal();
			void navigate({ to: `/pending/${row.pendingId}` as string });
		},
		[
			projectId,
			collections,
			draft.runSetupScript,
			hostTarget,
			closeModal,
			navigate,
		],
	);

	const handleAdoptWorktree = useCallback(
		(branchName: string) => {
			insertPendingAndNavigate({
				pendingId: crypto.randomUUID(),
				intent: "adopt",
				workspaceName: resolveActionWorkspaceName(branchName),
				branchName,
			});
		},
		[insertPendingAndNavigate, resolveActionWorkspaceName],
	);

	const handleCheckout = useCallback(
		(branchName: string) => {
			insertPendingAndNavigate({
				pendingId: crypto.randomUUID(),
				intent: "checkout",
				workspaceName: resolveActionWorkspaceName(branchName),
				branchName,
			});
		},
		[insertPendingAndNavigate, resolveActionWorkspaceName],
	);

	// ── Create ───────────────────────────────────────────────────────
	const handleCreate = useSubmitWorkspace(projectId);

	const handlePromptSubmit = useCallback(() => {
		void handleCreate();
	}, [handleCreate]);

	useEffect(() => {
		if (!isNewWorkspaceModalOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				void handleCreate();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isNewWorkspaceModalOpen, handleCreate]);

	// ── Issue / PR linking ───────────────────────────────────────────
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
						placeholder={branchPreview || "branch name"}
						value={branchName}
						onChange={(e) =>
							updateDraft({
								branchName: e.target.value.replace(/\s+/g, "-"),
								branchNameEdited: true,
							})
						}
						onBlur={() => {
							const sanitized = sanitizeUserBranchName(branchName.trim());
							if (!sanitized)
								updateDraft({ branchName: "", branchNameEdited: false });
							else updateDraft({ branchName: sanitized });
						}}
					/>
				</div>
			</div>

			{/* Prompt input */}
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
									key={issue.url ?? issue.slug}
									initial={{ opacity: 0, scale: 0.8 }}
									animate={{ opacity: 1, scale: 1 }}
									exit={{ opacity: 0, scale: 0.8 }}
									transition={{ duration: 0.15 }}
								>
									{issue.source === "github" && issue.number != null ? (
										<LinkedGitHubIssuePill
											issueNumber={issue.number}
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
							hostTarget={hostTarget}
							anchorRef={plusMenuRef}
						/>
						<PRLinkCommand
							open={prLinkOpen}
							onOpenChange={setPRLinkOpen}
							onSelect={setLinkedPR}
							projectId={projectId}
							hostTarget={hostTarget}
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

			{/* Bottom bar */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<ProjectPickerPill
						selectedProject={selectedProject}
						recentProjects={recentProjects}
						onSelectProject={onSelectProject}
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
								<CompareBaseBranchPicker
									effectiveCompareBaseBranch={effectiveCompareBaseBranch}
									defaultBranch={defaultBranch}
									isBranchesLoading={isBranchesLoading}
									isBranchesError={isBranchesError}
									branches={branches}
									branchSearch={branchSearch}
									onBranchSearchChange={setBranchSearch}
									branchFilter={branchFilter}
									onBranchFilterChange={setBranchFilter}
									isFetchingNextPage={isFetchingNextPage}
									hasNextPage={hasNextPage ?? false}
									onLoadMore={() => {
										void fetchNextPage();
									}}
									onSelectCompareBaseBranch={(branch, source) =>
										updateDraft({
											baseBranch: branch,
											baseBranchSource: source,
										})
									}
									onCheckoutBranch={handleCheckout}
									onOpenExisting={handleOpenExisting}
									onAdoptWorktree={handleAdoptWorktree}
									hasWorkspaceForBranch={(name) => workspaceByBranch.has(name)}
								/>
							</motion.div>
						)}
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
