import {
	getAgentEffortSupport,
	getAgentModelSupport,
} from "@superset/shared/agent-models";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import { isEnterSubmit } from "@superset/ui/lib/keyboard";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon, PaperclipIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoIssueOpened } from "react-icons/go";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { AgentModelSelect } from "renderer/components/AgentModelSelect";
import { AgentSelect } from "renderer/components/AgentSelect";
import { LinkedIssuePill } from "renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/LinkedIssuePill";
import { IssueLinkCommand } from "renderer/components/Chat/ChatInterface/components/IssueLinkCommand";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { SupersetIcon } from "renderer/routes/_authenticated/onboarding/providers/components/SupersetIcon";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspacePromptContext } from "renderer/stores/new-workspace-prompt-context";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import { DevicePicker } from "../DashboardNewWorkspaceForm/components/DevicePicker";
import { useWorkspaceHostOptions } from "../DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { CompareBaseBranchPicker } from "../DashboardNewWorkspaceForm/PromptGroup/components/CompareBaseBranchPicker";
import { GitHubIssueLinkCommand } from "../DashboardNewWorkspaceForm/PromptGroup/components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "../DashboardNewWorkspaceForm/PromptGroup/components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/LinkedPRPill";
import { PRLinkCommand } from "../DashboardNewWorkspaceForm/PromptGroup/components/PRLinkCommand";
import { ProjectPickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/ProjectPickerPill";
import { useBranchPickerController } from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useBranchPickerController";
import { useLinkedContext } from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useLinkedContext";
import { useSubmitWorkspace } from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useSubmitWorkspace";
import {
	useFileIdsForHost,
	useUploadAttachments,
} from "../DashboardNewWorkspaceForm/PromptGroup/hooks/useUploadAttachments";
import {
	AGENT_STORAGE_KEY,
	EFFORT_STORAGE_KEY,
	MODEL_STORAGE_KEY,
	PILL_BUTTON_CLASS,
	type WorkspaceCreateAgent,
} from "../DashboardNewWorkspaceForm/PromptGroup/types";
import { useSelectedHostProjectIds } from "../DashboardNewWorkspaceModalContent/hooks/useSelectedHostProjectIds";
import { AttachmentCard } from "./components/AttachmentCard";
import { SamplePrompts } from "./components/SamplePrompts";

interface NewWorkspaceScreenProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
}

/**
 * Experiment test arm (new-workspace-screen flag): a purpose-built full-screen
 * take on workspace creation for new users — heading, sample prompts, and a
 * minimal composer. Independent of the control modal's PromptGroup so the two
 * arms can evolve separately.
 */
export function NewWorkspaceScreen({
	isOpen,
	preSelectedProjectId,
}: NewWorkspaceScreenProps) {
	const navigate = useNavigate();
	const [promptSeed, setPromptSeed] = useState(0);
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const { closeModal, draft, updateDraft, resetKey } =
		useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const hostService = useLocalHostService();
	const { activeHostUrl, machineId } = hostService;
	const relayUrl = useRelayUrl();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);

	useEffect(() => {
		if (!isOpen) return;
		track("new_workspace_screen_shown");
	}, [isOpen]);

	// Drag-over affordance for the page-wide drop zone (the actual drop is
	// handled by PromptInput's globalDrop). dragover fires continuously while a
	// drag is over the window, so a short timeout self-heals every missed-event
	// case (Esc-cancelled drags, drops outside the window) that an enter/leave
	// counter gets permanently stuck on.
	const [isDraggingFiles, setIsDraggingFiles] = useState(false);
	// Source paths for dropped/picked files, keyed by filename — the attachment
	// items only keep an object URL, and Finder reveal needs the original path.
	const attachmentPathsRef = useRef(new Map<string, string>());
	useEffect(() => {
		if (!isOpen) return;
		let timer: number | null = null;
		const recordPaths = (files: FileList | null | undefined) => {
			for (const file of Array.from(files ?? [])) {
				try {
					const path = window.webUtils.getPathForFile(file);
					if (path) attachmentPathsRef.current.set(file.name, path);
				} catch {
					// pasted/synthetic files have no filesystem path
				}
			}
		};
		const onDragOver = (e: DragEvent) => {
			if (!Array.from(e.dataTransfer?.types ?? []).includes("Files")) return;
			setIsDraggingFiles(true);
			if (timer !== null) window.clearTimeout(timer);
			timer = window.setTimeout(() => setIsDraggingFiles(false), 200);
		};
		const onDrop = (e: DragEvent) => {
			recordPaths(e.dataTransfer?.files);
			if (timer !== null) window.clearTimeout(timer);
			timer = null;
			setIsDraggingFiles(false);
		};
		const onChange = (e: Event) => {
			if (e.target instanceof HTMLInputElement && e.target.type === "file") {
				recordPaths(e.target.files);
			}
		};
		document.addEventListener("dragover", onDragOver);
		document.addEventListener("drop", onDrop);
		document.addEventListener("change", onChange, true);
		return () => {
			document.removeEventListener("dragover", onDragOver);
			document.removeEventListener("drop", onDrop);
			document.removeEventListener("change", onChange, true);
			if (timer !== null) window.clearTimeout(timer);
			setIsDraggingFiles(false);
		};
	}, [isOpen]);

	// ── Projects ─────────────────────────────────────────────────────
	const { projects: hostProjects, isReady: areProjectsReady } =
		useHostProjects();
	const setUpProjectIds = useSelectedHostProjectIds(draft.hostId);
	const projects = useMemo(
		() =>
			hostProjects
				.filter((project) => Boolean(project.projectKey))
				.map((project) => ({
					id: project.projectKey,
					name: project.name,
					githubOwner: project.repoOwner,
					githubRepoName: project.repoName,
					iconUrl: project.repoOwner
						? `https://github.com/${project.repoOwner}.png?size=64`
						: null,
					needsSetup:
						setUpProjectIds === null
							? null
							: !setUpProjectIds.has(project.projectKey),
				})),
		[hostProjects, setUpProjectIds],
	);

	useEffect(() => {
		if (!isOpen || !areProjectsReady) return;
		const isValid = (id: string | null | undefined) =>
			Boolean(id && projects.some((project) => project.id === id));
		if (preSelectedProjectId && isValid(preSelectedProjectId)) {
			if (draft.selectedProjectId !== preSelectedProjectId) {
				updateDraft({ selectedProjectId: preSelectedProjectId });
			}
			return;
		}
		if (isValid(draft.selectedProjectId)) return;
		const { lastProjectId } = useV2WorkspaceCreateDefaultsStore.getState();
		updateDraft({
			selectedProjectId: isValid(lastProjectId)
				? lastProjectId
				: (projects[0]?.id ?? null),
		});
	}, [
		isOpen,
		areProjectsReady,
		preSelectedProjectId,
		draft.selectedProjectId,
		projects,
		updateDraft,
	]);

	const projectId = draft.selectedProjectId;
	const selectedProject = projects.find((project) => project.id === projectId);
	const needsSetup = selectedProject?.needsSetup === true;
	const isPromptEmpty = !draft.prompt.trim();
	const {
		addLinkedIssue,
		addLinkedGitHubIssue,
		removeLinkedIssue,
		setLinkedPR,
		removeLinkedPR,
	} = useLinkedContext(draft.linkedIssues, updateDraft);

	// Restore the last-used launch host once per mount, like the modal does.
	const appliedPersistedHostRef = useRef(false);
	useEffect(() => {
		if (!isOpen || appliedPersistedHostRef.current) return;
		appliedPersistedHostRef.current = true;
		const persistedHostId =
			useV2WorkspaceCreateDefaultsStore.getState().lastHostId;
		if (typeof persistedHostId === "string") {
			updateDraft({ hostId: persistedHostId });
		}
	}, [isOpen, updateDraft]);

	// Reset baseBranch on project or host change, defaulting to the user's
	// last selected branch for that project — the draft store is global, so a
	// stale branch from another project would otherwise ride into the create.
	const persistedBaseBranchDefault = useV2WorkspaceCreateDefaultsStore(
		(state) =>
			projectId ? (state.baseBranchesByProjectId[projectId] ?? null) : null,
	);
	const setBaseBranchDefault = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setBaseBranchDefault,
	);
	const clearBaseBranchDefault = useV2WorkspaceCreateDefaultsStore(
		(state) => state.clearBaseBranchDefault,
	);
	const previousProjectIdRef = useRef(projectId);
	const previousHostIdRef = useRef(draft.hostId);
	useEffect(() => {
		if (
			previousProjectIdRef.current !== projectId ||
			previousHostIdRef.current !== draft.hostId
		) {
			previousProjectIdRef.current = projectId;
			previousHostIdRef.current = draft.hostId;
			updateDraft({
				baseBranch: persistedBaseBranchDefault?.branchName ?? null,
				baseBranchSource: persistedBaseBranchDefault?.source ?? null,
			});
		}
	}, [projectId, draft.hostId, persistedBaseBranchDefault, updateDraft]);

	// ── Agent / model / effort ───────────────────────────────────────
	const launchHostUrl = useMemo(() => {
		const id = draft.hostId ?? machineId;
		if (!id || !activeOrganizationId) return null;
		return (
			resolveHostUrl({
				hostId: id,
				machineId,
				activeHostUrl,
				organizationId: activeOrganizationId,
				relayUrl,
			}) ?? null
		);
	}, [draft.hostId, machineId, activeHostUrl, activeOrganizationId, relayUrl]);
	const { agents: v2Agents, isFetched: v2AgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	const selectableAgentIds = useMemo(
		() => v2Agents.map((agent) => agent.id),
		[v2Agents],
	);
	const { selectedAgent, setSelectedAgent } =
		useAgentLaunchPreferences<WorkspaceCreateAgent>({
			agentStorageKey: AGENT_STORAGE_KEY,
			defaultAgent: "none",
			fallbackAgent: "none",
			validAgents: ["none", ...selectableAgentIds],
			agentsReady: v2AgentsFetched,
		});

	// Same "none" → first-agent promotion as the control modal: new users land
	// here with no stored preference, and the screen must not default to no agent.
	useEffect(() => {
		if (!v2AgentsFetched) return;
		if (selectedAgent !== "none") return;
		const stored =
			typeof window !== "undefined"
				? window.localStorage.getItem(AGENT_STORAGE_KEY)
				: null;
		if (stored === "none") return;
		const first = selectableAgentIds[0];
		if (first) setSelectedAgent(first);
	}, [v2AgentsFetched, selectableAgentIds, selectedAgent, setSelectedAgent]);

	const selectedPresetId = useMemo(
		() => v2Agents.find((agent) => agent.id === selectedAgent)?.iconId ?? null,
		[v2Agents, selectedAgent],
	);
	const modelSupport = selectedPresetId
		? getAgentModelSupport(selectedPresetId)
		: undefined;
	const { selectedModel, setSelectedModel } = useAgentModelPreference(
		MODEL_STORAGE_KEY,
		modelSupport ? selectedPresetId : null,
	);
	const effortSupport = selectedPresetId
		? getAgentEffortSupport(selectedPresetId)
		: undefined;
	const { selectedEffort, setSelectedEffort } = useAgentEffortPreference(
		EFFORT_STORAGE_KEY,
		effortSupport ? selectedPresetId : null,
	);

	// ── Base branch ──────────────────────────────────────────────────
	const { pickerProps } = useBranchPickerController({
		projectId,
		hostId: draft.hostId,
		baseBranch: draft.baseBranch,
		typedWorkspaceName: draft.workspaceName,
		onBaseBranchChange: (branch, source) => {
			if (projectId) {
				if (branch && source) {
					setBaseBranchDefault(projectId, branch, source);
				} else {
					clearBaseBranchDefault(projectId);
				}
			}
			updateDraft({ baseBranch: branch, baseBranchSource: source });
		},
		closeModal,
	});

	// ── Submit ───────────────────────────────────────────────────────
	const uploadAttachments = useUploadAttachments({
		files: attachments.files,
		hostUrl: launchHostUrl,
	});
	const fileIdsForCurrentHost = useFileIdsForHost(launchHostUrl);
	const visibleFiles = useMemo(() => {
		const idSet = new Set(fileIdsForCurrentHost);
		return attachments.files.filter((file) => idSet.has(file.id));
	}, [attachments.files, fileIdsForCurrentHost]);
	const promptContext = useNewWorkspacePromptContext({
		projectId,
		hostId: draft.hostId,
		linkedPR: draft.linkedPR,
		linkedIssues: draft.linkedIssues,
	});
	const createWorkspace = useSubmitWorkspace(
		projectId,
		selectedAgent,
		modelSupport ? selectedModel : null,
		effortSupport ? selectedEffort : null,
		uploadAttachments,
		promptContext,
	);

	const { otherHosts } = useWorkspaceHostOptions();
	const submitBlocker = useMemo<string | null>(() => {
		if (!projectId) return "Select a project";
		const selectedHostId = draft.hostId ?? machineId;
		if (!selectedHostId) return "No active host";
		if (selectedHostId !== machineId) {
			const remote = otherHosts.find((host) => host.id === selectedHostId);
			if (!remote?.isOnline) return "Host is offline";
		} else if (!activeHostUrl) {
			return "Host service is not running";
		}
		return null;
	}, [projectId, draft.hostId, machineId, activeHostUrl, otherHosts]);

	const handleGoToSetup = useCallback(() => {
		if (!selectedProject?.id) return;
		const targetProjectId = selectedProject.id;
		closeModal();
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: targetProjectId },
			search: { hostId: draft.hostId ?? machineId ?? undefined },
		});
	}, [closeModal, draft.hostId, machineId, navigate, selectedProject?.id]);

	const handleSubmit = useCallback(() => {
		if (needsSetup) {
			handleGoToSetup();
			return;
		}
		if (isPromptEmpty) return;
		if (submitBlocker) {
			if ((draft.hostId ?? machineId) === machineId && !activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "create the workspace",
				});
			} else {
				toast.error(submitBlocker);
			}
			return;
		}
		void createWorkspace();
	}, [
		activeHostUrl,
		createWorkspace,
		draft.hostId,
		handleGoToSetup,
		hostService,
		isPromptEmpty,
		machineId,
		needsSetup,
		submitBlocker,
	]);

	useEffect(() => {
		if (!isOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.repeat) return;
			if (!isEnterSubmit(e, { requireMod: true })) return;
			e.preventDefault();
			handleSubmit();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isOpen, handleSubmit]);

	// ── Render ───────────────────────────────────────────────────────
	return (
		<div className="absolute inset-0 z-40 flex flex-col items-center overflow-y-auto bg-background">
			<AnimatePresence>
				{isDraggingFiles && (
					<motion.div
						key="drop-overlay"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.075, ease: "easeOut" }}
						className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/70"
					>
						<span className="rounded-lg border border-border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md">
							Drop to attach
						</span>
					</motion.div>
				)}
			</AnimatePresence>
			<div className="flex flex-1 flex-col items-center justify-center gap-8">
				<SupersetIcon className="h-10 w-auto text-muted-foreground/70" />
				<h1 className="text-center text-3xl font-medium text-foreground/90">
					What should we build next?
				</h1>
			</div>
			<div className="relative flex w-full max-w-[640px] flex-col px-6 pb-8">
				<AnimatePresence initial={false}>
					{isPromptEmpty && (
						<motion.div
							key="sample-prompts"
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, transition: { duration: 0 } }}
							transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
							className="absolute inset-x-6 bottom-full mb-1"
						>
							<SamplePrompts
								onSelect={(prompt) => {
									updateDraft({ prompt });
									setPromptSeed((seed) => seed + 1);
								}}
							/>
						</motion.div>
					)}
				</AnimatePresence>
				<PromptInput
					onSubmit={handleSubmit}
					multiple
					globalDrop
					maxFiles={5}
					maxFileSize={10 * 1024 * 1024}
					className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
				>
					{(draft.linkedPR ||
						draft.linkedIssues.length > 0 ||
						visibleFiles.length > 0) && (
						<div className="flex items-start gap-2 self-stretch overflow-x-auto px-3 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
							{draft.linkedPR && (
								<div className="shrink-0">
									<LinkedPRPill
										prNumber={draft.linkedPR.prNumber}
										title={draft.linkedPR.title}
										state={draft.linkedPR.state}
										onRemove={removeLinkedPR}
									/>
								</div>
							)}
							{draft.linkedIssues.map((issue) => (
								<div key={issue.url ?? issue.slug} className="shrink-0">
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
								</div>
							))}
							{visibleFiles.map((file) => {
								const sourcePath = file.filename
									? (attachmentPathsRef.current.get(file.filename) ?? null)
									: null;
								return (
									<AttachmentCard
										key={file.id}
										file={file}
										hostUrl={launchHostUrl}
										onRemove={(id) => attachments.remove(id)}
										onOpenFile={
											sourcePath
												? () => openInFinderMutation.mutate(sourcePath)
												: null
										}
									/>
								);
							})}
						</div>
					)}
					<MarkdownEditor
						key={`${resetKey}-${promptSeed}`}
						content={draft.prompt}
						onChange={(markdown) => updateDraft({ prompt: markdown })}
						onPasteFiles={(files) => attachments.add(files)}
						onEnterSubmit={handleSubmit}
						autoFocus={promptSeed > 0 ? "end" : "start"}
						placeholder="What do you want to do?"
						className="flex flex-col min-h-[80px] max-h-[200px] px-3 pt-3"
						editorClassName="overflow-y-auto text-sm"
						features={{
							slashCommand: false,
							emoji: false,
							fileMention: false,
							bubbleMenu: false,
						}}
					/>
					<PromptInputFooter>
						<PromptInputTools className="gap-1.5">
							<AgentSelect<WorkspaceCreateAgent>
								agents={v2Agents}
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
							{modelSupport && (
								<AgentModelSelect
									models={modelSupport.models}
									value={selectedModel}
									onValueChange={setSelectedModel}
									triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
								/>
							)}
							{effortSupport && (
								<AgentModelSelect
									models={effortSupport.efforts}
									value={selectedEffort}
									onValueChange={setSelectedEffort}
									triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
								/>
							)}
						</PromptInputTools>
						<div className="flex items-center gap-2">
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
								hostId={draft.hostId}
								tooltipLabel="Link GitHub issue"
							>
								<PromptInputButton
									aria-label="Link GitHub issue"
									className={`${PILL_BUTTON_CLASS} w-[22px]`}
								>
									<GoIssueOpened className="size-3.5" />
								</PromptInputButton>
							</GitHubIssueLinkCommand>
							<PRLinkCommand
								onSelect={setLinkedPR}
								projectId={projectId}
								hostId={draft.hostId}
								tooltipLabel="Link pull request"
							>
								<PromptInputButton
									aria-label="Link pull request"
									className={`${PILL_BUTTON_CLASS} w-[22px]`}
								>
									<LuGitPullRequest className="size-3.5" />
								</PromptInputButton>
							</PRLinkCommand>
							<Tooltip>
								<TooltipTrigger asChild>
									<PromptInputButton
										aria-label="Add attachment"
										className={`${PILL_BUTTON_CLASS} w-[22px]`}
										onClick={() => attachments.openFileDialog()}
									>
										<PaperclipIcon className="size-3.5" />
									</PromptInputButton>
								</TooltipTrigger>
								<TooltipContent side="bottom">Add attachment</TooltipContent>
							</Tooltip>
							<PromptInputSubmit
								className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
								disabled={needsSetup || isPromptEmpty}
								onClick={(e) => {
									e.preventDefault();
									handleSubmit();
								}}
							>
								<ArrowUpIcon className="size-3.5 text-muted-foreground" />
							</PromptInputSubmit>
						</div>
					</PromptInputFooter>
				</PromptInput>
				<div className="mt-2 flex items-center justify-between gap-2">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<DevicePicker
							hostId={draft.hostId}
							onSelectHostId={(next) => {
								setLastHostId(next);
								updateDraft({ hostId: next });
							}}
						/>
						<ProjectPickerPill
							selectedProject={selectedProject}
							projects={projects}
							onSelectProject={(selectedProjectId) => {
								setLastProjectId(selectedProjectId);
								updateDraft({ selectedProjectId });
							}}
						/>
						{draft.linkedPR ? (
							<span className="flex items-center gap-1 text-xs text-muted-foreground">
								<LuGitPullRequest className="size-3 shrink-0" />
								based off PR #{draft.linkedPR.prNumber}
							</span>
						) : (
							<CompareBaseBranchPicker {...pickerProps} />
						)}
					</div>
					{needsSetup && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-6 px-2 text-[11px] text-amber-500 hover:text-amber-500"
							onClick={handleGoToSetup}
						>
							Set up project…
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
