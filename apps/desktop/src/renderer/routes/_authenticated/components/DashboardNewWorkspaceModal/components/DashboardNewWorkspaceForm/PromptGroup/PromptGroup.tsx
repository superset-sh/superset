import {
	sanitizeUserBranchName,
	slugifyForBranch,
} from "@superset/shared/workspace-launch";
import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Input } from "@superset/ui/input";
import { isEnterSubmit } from "@superset/ui/lib/keyboard";
import { cn } from "@superset/ui/utils";
import type { FileUIPart } from "ai";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { GoIssueOpened } from "react-icons/go";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { AgentSelect } from "renderer/components/AgentSelect";
import { LinkedIssuePill } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { useEnabledAgents } from "renderer/hooks/useEnabledAgents";
import { PLATFORM } from "renderer/hotkeys";
import { useNewWorkspaceModalOpen } from "renderer/stores/new-workspace-modal";
import { useDashboardNewWorkspaceDraft } from "../../../DashboardNewWorkspaceDraftContext";
import { DevicePicker } from "../components/DevicePicker";
import { AttachmentButtons } from "./components/AttachmentButtons";
import { CompareBaseBranchPicker } from "./components/CompareBaseBranchPicker";
import { GitHubIssueLinkCommand } from "./components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "./components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "./components/LinkedPRPill";
import { PRLinkCommand } from "./components/PRLinkCommand";
import { ProjectPickerPill } from "./components/ProjectPickerPill";
import { useBranchPickerController } from "./hooks/useBranchPickerController";
import { useLinkedContext } from "./hooks/useLinkedContext";
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

export function PromptGroup({
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
	const { agents: enabledAgentPresets, isFetched: agentsFetched } =
		useEnabledAgents();
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
			agentsReady: agentsFetched,
		});

	const trimmedPrompt = prompt.trim();
	const branchPreview = branchNameEdited
		? sanitizeUserBranchName(branchName)
		: slugifyForBranch(trimmedPrompt);

	// Reset baseBranch on project or host change.
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

	// ── Branch picker controller ─────────────────────────────────────
	const { pickerProps } = useBranchPickerController({
		projectId,
		hostTarget,
		baseBranch,
		runSetupScript: draft.runSetupScript,
		typedWorkspaceName: workspaceName,
		onBaseBranchChange: (branch, source) =>
			updateDraft({ baseBranch: branch, baseBranchSource: source }),
		closeModal,
	});

	// ── Submit (fork) ────────────────────────────────────────────────
	const handleCreate = useSubmitWorkspace(projectId);
	const handlePromptSubmit = useCallback(
		(message: { text?: string; files?: FileUIPart[] }) => {
			// Library converts blob: → data: URLs before calling us; pass them
			// through. We intentionally do not read attachments from the
			// provider here — the library clears + revokes before onSubmit, so
			// the provider's state is stale by this point.
			const files = (message.files ?? [])
				.filter((f) => typeof f.url === "string" && f.url.length > 0)
				.map((f) => ({
					url: f.url,
					mediaType: f.mediaType,
					filename: f.filename,
				}));
			void handleCreate(files);
		},
		[handleCreate],
	);

	useEffect(() => {
		if (!isNewWorkspaceModalOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (!isEnterSubmit(e, { requireMod: true })) return;
			e.preventDefault();
			// Keyboard fallback: submit without attachments. Inside the
			// modal's form focus, PromptInput's own Enter handler fires
			// instead and routes through handlePromptSubmit with files.
			void handleCreate();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isNewWorkspaceModalOpen, handleCreate]);

	// ── Linked issues / PR ───────────────────────────────────────────
	const {
		addLinkedIssue,
		addLinkedGitHubIssue,
		removeLinkedIssue,
		setLinkedPR,
		removeLinkedPR,
	} = useLinkedContext(linkedIssues, updateDraft);

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
							linearIssueTrigger={
								<IssueLinkCommand
									onSelect={addLinkedIssue}
									tooltipLabel="Link issue"
								>
									<PromptInputButton
										aria-label="Link issue"
										className={`${PILL_BUTTON_CLASS} w-[22px]`}
									>
										<SiLinear className="size-3.5" />
									</PromptInputButton>
								</IssueLinkCommand>
							}
							githubIssueTrigger={
								<GitHubIssueLinkCommand
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
									tooltipLabel="Link GitHub issue"
								>
									<PromptInputButton
										aria-label="Link GitHub issue"
										className={`${PILL_BUTTON_CLASS} w-[22px]`}
									>
										<GoIssueOpened className="size-3.5" />
									</PromptInputButton>
								</GitHubIssueLinkCommand>
							}
							prTrigger={
								<PRLinkCommand
									onSelect={setLinkedPR}
									projectId={projectId}
									hostTarget={hostTarget}
									tooltipLabel="Link pull request"
								>
									<PromptInputButton
										aria-label="Link pull request"
										className={`${PILL_BUTTON_CLASS} w-[22px]`}
									>
										<LuGitPullRequest className="size-3.5" />
									</PromptInputButton>
								</PRLinkCommand>
							}
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
					<DevicePicker
						hostTarget={hostTarget}
						onSelectHostTarget={(t) => updateDraft({ hostTarget: t })}
					/>
					<ProjectPickerPill
						selectedProject={selectedProject}
						projects={recentProjects}
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
								<CompareBaseBranchPicker {...pickerProps} />
							</motion.div>
						)}
					</AnimatePresence>
				</div>
				<div className="flex items-center gap-1.5">
					{selectedProject?.needsSetup === true && (
						<span className="text-[11px] text-amber-500">
							Project needs to be set up
						</span>
					)}
					<span className="text-[11px] text-muted-foreground/50">
						{modKey}↵
					</span>
				</div>
			</div>
		</div>
	);
}
