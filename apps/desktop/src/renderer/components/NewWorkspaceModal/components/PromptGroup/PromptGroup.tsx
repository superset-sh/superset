import type { AgentLaunchRequest } from "@superset/shared/agent-launch";
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
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuGitPullRequest } from "react-icons/lu";
import { AgentSelect } from "renderer/components/AgentSelect";
import { LinkedIssuePill } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
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
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { AttachmentButtons } from "./components/AttachmentButtons";
import { CompareBaseBranchPickerInline } from "./components/CompareBaseBranchPickerInline";
import { GitHubIssueLinkCommand } from "./components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "./components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "./components/LinkedPRPill";
import { PRLinkCommand } from "./components/PRLinkCommand";
import { ProjectPickerPill } from "./components/ProjectPickerPill";
import { PILL_BUTTON_CLASS } from "./constants";
import { useBranchData } from "./hooks/useBranchData";
import { useLinkedItems } from "./hooks/useLinkedItems";
import type { ProjectOption } from "./types";
import {
	type ConvertedFile,
	convertPromptInputFiles,
} from "./utils/convertFiles";
import { fetchGitHubIssueFiles } from "./utils/fetchGitHubIssueFiles";
import type { OpenableWorktreeAction } from "./utils/resolveOpenableWorktrees";

type WorkspaceCreateAgent = AgentDefinitionId | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

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
		closeModal,
		closeAndResetDraft,
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

	// Agent presets
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

	// Local state
	const [issueLinkOpen, setIssueLinkOpen] = useState(false);
	const [gitHubIssueLinkOpen, setGitHubIssueLinkOpen] = useState(false);
	const [prLinkOpen, setPRLinkOpen] = useState(false);
	const plusMenuRef = useRef<HTMLDivElement>(null);
	const submitStartedRef = useRef(false);
	const firstIssueSlug = linkedIssues[0]?.slug ?? null;

	// AI branch name generation (on submit only)
	const generateBranchNameMutation =
		electronTrpc.workspaces.generateBranchName.useMutation();
	useEffect(() => {
		if (isNewWorkspaceModalOpen) {
			submitStartedRef.current = false;
		}
	}, [isNewWorkspaceModalOpen]);

	// Branch data
	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const {
		branchData,
		isBranchesLoading,
		isBranchesError,
		worktreeBranches,
		activeWorkspacesByBranch,
		openableWorktrees,
		externalWorktreeBranches,
	} = useBranchData(projectId);

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

	// Linked items
	const {
		addLinkedIssue,
		addLinkedGitHubIssue,
		removeLinkedIssue,
		setLinkedPR,
		removeLinkedPR,
	} = useLinkedItems(linkedIssues, updateDraft);

	// --- Handlers ---

	const handleCreate = useCallback(
		async (options?: { throwOnError?: boolean }) => {
			if (!projectId) {
				toast.error("Select a project first");
				return;
			}

			if (submitStartedRef.current) {
				return;
			}
			submitStartedRef.current = true;
			const throwOnError = options?.throwOnError ?? false;
			const trimmedPromptText = prompt.trim();

			const displayName =
				workspaceNameEdited && workspaceName.trim()
					? workspaceName.trim()
					: trimmedPromptText || "New workspace";
			const willGenerateAIName =
				!branchNameEdited && !!trimmedPromptText && !linkedPR;
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
								prompt: trimmedPromptText,
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
							submitStartedRef.current = false;
							if (throwOnError) {
								throw error;
							}
							return;
						} else {
							console.warn("[PromptGroup] AI generation failed:", error);
							toast.info(
								"Using random branch name (AI generation unavailable)",
							);
						}
					} finally {
						setPendingWorkspaceStatus(pendingWorkspaceId, "preparing");
					}
				}

				let convertedFiles: ConvertedFile[] = [];
				if (detachedFiles.length > 0) {
					try {
						convertedFiles = await convertPromptInputFiles(detachedFiles);
					} catch (err) {
						clearPendingWorkspace(pendingWorkspaceId);
						submitStartedRef.current = false;
						toast.error(
							err instanceof Error
								? err.message
								: "Failed to process attachments",
						);
						if (throwOnError) {
							throw err;
						}
						return;
					}
				}

				// Fetch and attach GitHub issue content
				try {
					const issueFiles = await fetchGitHubIssueFiles(
						linkedIssues,
						projectId,
						(params) =>
							utils.client.projects.getIssueContent.query({
								projectId: params.projectId,
								issueNumber: params.issueNumber,
							}),
					);
					convertedFiles = [...convertedFiles, ...issueFiles];
				} catch (err) {
					console.warn("Failed to fetch GitHub issue contents:", err);
				}

				let launchRequest: AgentLaunchRequest | null = null;
				try {
					launchRequest = buildPromptAgentLaunchRequest({
						workspaceId: "pending-workspace",
						source: "new-workspace",
						selectedAgent,
						prompt: trimmedPromptText,
						initialFiles:
							convertedFiles.length > 0 ? convertedFiles : undefined,
						taskSlug: firstIssueSlug || undefined,
						configsById: agentConfigsById,
					});
				} catch (error) {
					clearPendingWorkspace(pendingWorkspaceId);
					submitStartedRef.current = false;
					toast.error(
						error instanceof Error
							? error.message
							: "Failed to prepare agent launch",
					);
					if (throwOnError) {
						throw error;
					}
					return;
				}

				setPendingWorkspaceStatus(pendingWorkspaceId, "creating");

				if (linkedPR) {
					return runAsyncAction(
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
				}

				return runAsyncAction(
					createWorkspace.mutateAsyncWithPendingSetup(
						{
							projectId,
							name:
								workspaceNameEdited && workspaceName.trim()
									? workspaceName.trim()
									: undefined,
							prompt: trimmedPromptText || undefined,
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
			} catch (error) {
				clearPendingWorkspace(pendingWorkspaceId);
				submitStartedRef.current = false;
				if (throwOnError) {
					throw error;
				}
			} finally {
				for (const file of detachedFiles) {
					if (file.url?.startsWith("blob:")) {
						URL.revokeObjectURL(file.url);
					}
				}
			}
		},
		[
			agentConfigsById,
			attachments,
			closeAndResetDraft,
			compareBaseBranch,
			branchName,
			branchNameEdited,
			clearPendingWorkspace,
			createFromPr,
			createWorkspace,
			firstIssueSlug,
			generateBranchNameMutation,
			linkedIssues,
			linkedPR,
			projectId,
			runAsyncAction,
			runSetupScript,
			selectedAgent,
			setPendingWorkspace,
			setPendingWorkspaceStatus,
			prompt,
			utils,
			workspaceName,
			workspaceNameEdited,
		],
	);

	const handlePromptSubmit = async () => {
		await handleCreate({ throwOnError: true });
	};

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

	const handleCompareBaseBranchSelect = (selectedBaseBranch: string) => {
		updateDraft({ compareBaseBranch: selectedBaseBranch });
	};

	const handleOpenWorktree = (action: OpenableWorktreeAction) => {
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
	};

	const handleOpenActiveWorkspace = (workspaceId: string) => {
		closeModal();
		void navigateToWorkspace(workspaceId, navigate);
	};

	return (
		<div className="p-3 space-y-2">
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
						if (!workspaceName.trim()) {
							updateDraft({ workspaceName: "", workspaceNameEdited: false });
						}
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
							anchorRef={plusMenuRef}
						/>
						<PRLinkCommand
							open={prLinkOpen}
							onOpenChange={setPRLinkOpen}
							onSelect={setLinkedPR}
							projectId={projectId}
							githubOwner={project?.githubOwner ?? null}
							repoName={project?.mainRepoPath.split("/").pop() ?? null}
							anchorRef={plusMenuRef}
						/>
						<PromptInputSubmit className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20">
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
					{modKey}↵ to create
				</span>
			</div>
		</div>
	);
}
