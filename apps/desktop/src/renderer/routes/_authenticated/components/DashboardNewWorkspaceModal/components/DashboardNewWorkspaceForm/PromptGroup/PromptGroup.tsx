import { Trans, useLingui } from "@lingui/react/macro";
import {
	getAgentEffortSupport,
	getAgentEfforts,
	getAgentModelSupport,
	getAgentModeSupport,
} from "@superset/shared/agent-models";
import { sanitizeUserBranchName } from "@superset/shared/workspace-launch";
import {
	PromptInput,
	PromptInputButton,
	PromptInputFooter,
	PromptInputSubmit,
	PromptInputTools,
	useProviderAttachments,
} from "@superset/ui/ai-elements/prompt-input";
import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { isEnterSubmit } from "@superset/ui/lib/keyboard";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpIcon, HistoryIcon, Settings2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoIssueOpened } from "react-icons/go";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { AgentModelSelect } from "renderer/components/AgentModelSelect";
import { AgentSelect } from "renderer/components/AgentSelect";
import { IssueLinkCommand } from "renderer/components/IssueLinkCommand";
import { LinkedIssuePill } from "renderer/components/LinkedIssuePill";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { useAgentModePreference } from "renderer/hooks/useAgentModePreference";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { CLOUD_AGENT_CHOICES } from "renderer/hooks/useV2AgentChoices/cloud-agent-choices";
import { PLATFORM } from "renderer/hotkeys";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useNewWorkspaceModalOpen } from "renderer/stores/new-workspace-modal";
import { useNewWorkspacePromptContext } from "renderer/stores/new-workspace-prompt-context";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useDashboardNewWorkspaceDraft } from "../../../DashboardNewWorkspaceDraftContext";
import { DevicePicker } from "../components/DevicePicker";
import { CLOUD_HOST_ID } from "../components/DevicePicker/DevicePicker";
import { useWorkspaceHostOptions } from "../components/DevicePicker/hooks/useWorkspaceHostOptions";
import { AttachmentButtons } from "./components/AttachmentButtons";
import { CompareBaseBranchPicker } from "./components/CompareBaseBranchPicker";
import { EnvironmentPickerPill } from "./components/EnvironmentPickerPill";
import { GitHubIssueLinkCommand } from "./components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "./components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "./components/LinkedPRPill";
import { PRLinkCommand } from "./components/PRLinkCommand";
import { ProjectPickerPill } from "./components/ProjectPickerPill";
import { PromptHistoryCommand } from "./components/PromptHistoryCommand";
import { UploadingAttachmentPill } from "./components/UploadingAttachmentPill";
import { useBranchPickerController } from "./hooks/useBranchPickerController";
import { useLinkedContext } from "./hooks/useLinkedContext";
import { useSubmitWorkspace } from "./hooks/useSubmitWorkspace";
import {
	useFileIdsForHost,
	useUploadAttachments,
} from "./hooks/useUploadAttachments";
import {
	AGENT_STORAGE_KEY,
	EFFORT_STORAGE_KEY,
	MODE_STORAGE_KEY,
	MODEL_STORAGE_KEY,
	PILL_BUTTON_CLASS,
	type ProjectOption,
	type WorkspaceCreateAgent,
} from "./types";

interface PromptGroupProps {
	projectId: string | null;
	selectedProject: ProjectOption | undefined;
	recentProjects: ProjectOption[];
	/** True when "No project" (session) is the explicit selection. */
	isSessionSelected?: boolean;
	/** Null selects "No project" (session). */
	onSelectProject: (projectId: string | null) => void;
}

export function PromptGroup({
	projectId,
	selectedProject,
	recentProjects,
	isSessionSelected = false,
	onSelectProject,
}: PromptGroupProps) {
	const { t } = useLingui();
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	// The markdown editor is uncontrolled after mount, so inserting a history
	// prompt bumps this seed to remount it with the new content (same pattern
	// as NewWorkspaceScreen's sample prompts).
	const [promptSeed, setPromptSeed] = useState(0);
	const isNewWorkspaceModalOpen = useNewWorkspaceModalOpen();
	const { closeModal, draft, updateDraft, resetKey } =
		useDashboardNewWorkspaceDraft();
	const navigate = useNavigate();
	const attachments = useProviderAttachments();
	const hostService = useLocalHostService();
	const { activeHostUrl, machineId } = hostService;
	const relayUrl = useRelayUrl();
	const activeOrganizationId = useActiveOrganizationId();
	const needsSetup = selectedProject?.needsSetup === true;
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
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);
	const handleGoToSetup = useCallback(() => {
		if (!selectedProject?.id) return;
		const targetProjectId = selectedProject.id;
		closeModal();
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: targetProjectId },
			search: {
				hostId: draft.hostId ?? machineId ?? undefined,
			},
		});
	}, [closeModal, draft.hostId, machineId, navigate, selectedProject?.id]);
	// AI naming (title + branch) follows the project's naming instructions;
	// this is the jump from "where do these names come from?" to the setting.
	const handleGoToNamingInstructions = useCallback(() => {
		if (!selectedProject?.id) return;
		const targetProjectId = selectedProject.id;
		closeModal();
		void navigate({
			to: "/settings/projects/$projectId",
			params: { projectId: targetProjectId },
			search: {
				hostId: draft.hostId ?? machineId ?? undefined,
				focus: "naming-instructions",
			},
		});
	}, [closeModal, draft.hostId, machineId, navigate, selectedProject?.id]);
	const {
		baseBranch,
		hostId,
		prompt,
		workspaceName,
		branchName,
		branchNameEdited,
		linkedIssues,
		linkedPR,
	} = draft;

	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: activeOrganizationId ?? "" },
		{ enabled: hostId === CLOUD_HOST_ID && !!activeOrganizationId },
	);
	const environmentOptions = environmentsQuery.data ?? [];
	const selectedEnvironment =
		environmentOptions.find((row) => row.id === draft.environmentId) ??
		environmentOptions[0];

	// ── Agent configs (v2 host_agent_configs) ───────────────────────
	// Scoped to the launch host, not the local active host: agent UUIDs only
	// exist on the host that owns them, so picking from the local list while
	// submitting to a remote host would send a config id the target doesn't
	// recognize.
	const launchHostUrl = useMemo(() => {
		const id = draft.hostId ?? machineId;
		// "cloud" is a sentinel, not a host: resolving it would query a relay
		// address for a machine that does not exist.
		if (id === CLOUD_HOST_ID) return null;
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
	const { agents: hostAgents, isFetched: hostAgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	// A cloud workspace has no host to ask, so it offers the built-in presets;
	// custom agents follow once they live in the cloud (SUPER-2127).
	const v2Agents = hostId === CLOUD_HOST_ID ? CLOUD_AGENT_CHOICES : hostAgents;
	const v2AgentsFetched = hostId === CLOUD_HOST_ID || hostAgentsFetched;
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

	// ── Model picker (per agent preset) ──────────────────────────────
	// `launchPresetId` carries executable-aware capability metadata; Superset
	// chat has no host config and falls back to its icon id.
	const selectedPresetId = useMemo(() => {
		const agent = v2Agents.find((candidate) => candidate.id === selectedAgent);
		return agent?.launchPresetId ?? agent?.presetId ?? agent?.iconId ?? null;
	}, [v2Agents, selectedAgent]);
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
	// Codex's top two efforts only exist on its GPT-5.6 models, so the offered
	// list follows the model picker. A remembered effort the current model
	// rejects stays stored but shows (and launches) as the agent default.
	const effortOptions = useMemo(
		() =>
			selectedPresetId
				? getAgentEfforts(selectedPresetId, selectedModel ?? undefined)
				: [],
		[selectedPresetId, selectedModel],
	);
	const effortForLaunch = effortOptions.some(
		(option) => option.id === selectedEffort,
	)
		? selectedEffort
		: null;
	const modeSupport = selectedPresetId
		? getAgentModeSupport(selectedPresetId)
		: undefined;
	const { selectedMode, setSelectedMode } = useAgentModePreference(
		MODE_STORAGE_KEY,
		modeSupport ? selectedPresetId : null,
	);

	// Promote the placeholder "none" → first configured agent whenever the
	// current selection isn't a real agent and the user hasn't explicitly
	// chosen "none". Fires on initial open (where useState init captured
	// "none" before the query resolved) AND on host switch (where the
	// previous host's UUID isn't valid here, so the corrective effect inside
	// useAgentLaunchPreferences resets to "none"). The corrective effect
	// can't rescue these on its own because "none" is always in validAgents.
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

	const branchPreview = branchNameEdited
		? sanitizeUserBranchName(branchName)
		: "";

	const applyPrompt = useCallback(
		(nextPrompt: string) => {
			updateDraft({ prompt: nextPrompt });
			setPromptSeed((seed) => seed + 1);
		},
		[updateDraft],
	);

	// Reset baseBranch on project or host change, defaulting to the user's
	// last selected branch for that project when one exists.
	const previousProjectIdRef = useRef(projectId);
	const previousHostIdRef = useRef(hostId);
	useEffect(() => {
		if (
			previousProjectIdRef.current !== projectId ||
			previousHostIdRef.current !== hostId
		) {
			previousProjectIdRef.current = projectId;
			previousHostIdRef.current = hostId;
			updateDraft({
				baseBranch: persistedBaseBranchDefault?.branchName ?? null,
				baseBranchSource: persistedBaseBranchDefault?.source ?? null,
			});
		}
	}, [projectId, hostId, persistedBaseBranchDefault, updateDraft]);

	// ── Branch picker controller ─────────────────────────────────────
	const { pickerProps } = useBranchPickerController({
		projectId,
		hostId,
		baseBranch,
		typedWorkspaceName: workspaceName,
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

	// ── Optimistic attachment upload ─────────────────────────────────
	const uploadHostUrl = useMemo(() => {
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
	const uploadAttachments = useUploadAttachments({
		files: attachments.files,
		hostUrl: uploadHostUrl,
	});

	// File pills follow the picker: only files attached *while* on this host
	// show, with previous-host attachments preserved silently in the upload
	// store for return visits.
	const fileIdsForCurrentHost = useFileIdsForHost(uploadHostUrl);
	const visibleFiles = useMemo(() => {
		const idSet = new Set(fileIdsForCurrentHost);
		return attachments.files.filter((file) => idSet.has(file.id));
	}, [attachments.files, fileIdsForCurrentHost]);

	// Submit gating: surface preconditions inline next to the submit button
	// instead of letting all three submit paths (button, Enter, Cmd+Enter)
	// fall into a toast.
	const { otherHosts } = useWorkspaceHostOptions();
	const submitBlocker = useMemo<string | null>(() => {
		if (!projectId && !draft.isSession)
			return t({
				message: "Select a project",
			});
		const selectedHostId = draft.hostId ?? machineId;
		// A cloud workspace is provisioned on submit, so there is no host whose
		// readiness could block it.
		if (selectedHostId === CLOUD_HOST_ID) return null;
		if (!selectedHostId)
			return t({
				message: "No active host",
			});
		if (selectedHostId !== machineId) {
			const remote = otherHosts.find((h) => h.id === selectedHostId);
			if (!remote?.isOnline)
				return t({
					message: "Host is offline",
				});
		} else if (!activeHostUrl) {
			return t({
				message: "Host service is not running",
			});
		}
		return null;
	}, [
		projectId,
		draft.isSession,
		draft.hostId,
		machineId,
		activeHostUrl,
		otherHosts,
		t,
	]);

	// ── Linked-context prefetch ──────────────────────────────────────
	const promptContext = useNewWorkspacePromptContext({
		projectId,
		hostId,
		linkedPR,
		linkedIssues,
	});

	// ── Submit (fork) ────────────────────────────────────────────────
	const { submitWorkspace: createWorkspace, isCreating } = useSubmitWorkspace(
		projectId,
		selectedAgent,
		modelSupport ? selectedModel : null,
		effortForLaunch,
		modeSupport ? selectedMode : null,
		uploadAttachments,
		promptContext,
	);
	const handleSubmit = useCallback(() => {
		if (needsSetup) {
			handleGoToSetup();
			return;
		}
		if (submitBlocker) {
			if ((draft.hostId ?? machineId) === machineId && !activeHostUrl) {
				showHostServiceUnavailableToast(hostService, {
					action: "createWorkspace",
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
		machineId,
		needsSetup,
		submitBlocker,
	]);

	useEffect(() => {
		if (!isNewWorkspaceModalOpen) return;
		const handler = (e: KeyboardEvent) => {
			if (e.repeat) return;
			if (!isEnterSubmit(e, { requireMod: true })) return;
			e.preventDefault();
			handleSubmit();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [isNewWorkspaceModalOpen, handleSubmit]);

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
					placeholder={t({
						message: "Workspace name (optional)",
					})}
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
						placeholder={
							branchPreview ||
							t({
								message: "branch name",
							})
						}
						value={branchName}
						onChange={(e) =>
							updateDraft({
								branchName: e.target.value.replace(/\s+/g, "-"),
								branchNameEdited: true,
								branchNameFromProvider: false,
							})
						}
						onBlur={() => {
							const sanitized = sanitizeUserBranchName(branchName.trim());
							if (!sanitized)
								updateDraft({
									branchName: "",
									branchNameEdited: false,
									branchNameFromProvider: false,
								});
							else updateDraft({ branchName: sanitized });
						}}
					/>
				</div>
				{selectedProject && !needsSetup && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={t({
									message: "Update naming instructions",
								})}
								className="ml-2 size-6 shrink-0 text-muted-foreground"
								onClick={handleGoToNamingInstructions}
							>
								<Settings2Icon className="size-3.5" />
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>
								Update naming instructions for {selectedProject.name}
							</Trans>
						</TooltipContent>
					</Tooltip>
				)}
				<PromptHistoryCommand
					onSelect={applyPrompt}
					tooltipLabel={t({
						message: "Previous prompts",
					})}
				>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label={t({
							message: "Previous prompts",
						})}
						className="ml-2 size-6 shrink-0 text-muted-foreground"
					>
						<HistoryIcon className="size-3.5" />
					</Button>
				</PromptHistoryCommand>
			</div>

			{/* Prompt input */}
			<PromptInput
				onSubmit={handleSubmit}
				multiple
				maxFiles={5}
				maxFileSize={10 * 1024 * 1024}
				onError={(error) => toast.error(error.message)}
				className="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-[0.5px] [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-foreground/[0.02]"
			>
				{(linkedPR || linkedIssues.length > 0 || visibleFiles.length > 0) && (
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
						{visibleFiles.map((file) => (
							<UploadingAttachmentPill
								key={file.id}
								file={file}
								hostUrl={uploadHostUrl}
							/>
						))}
					</div>
				)}
				{/* Markdown prompt editor. Submit stays on draft.prompt (now markdown):
				    the editor swallows Cmd/Ctrl+Enter (no newline) and the window-level
				    listener does the single submit, so onModEnter is intentionally unset
				    to avoid a double-fire. resetKey remounts a clean editor on reset. */}
				<MarkdownEditor
					key={`${resetKey}-${promptSeed}`}
					content={prompt}
					onChange={(markdown) => updateDraft({ prompt: markdown })}
					onPasteFiles={(files) => attachments.add(files)}
					autoFocus={promptSeed > 0 || prompt ? "end" : "start"}
					placeholder={t({
						message: "What do you want to do?",
					})}
					className="flex flex-col min-h-[100px] max-h-[200px] px-3 pt-3"
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
							placeholder={t({
								message: "No agent",
							})}
							onValueChange={setSelectedAgent}
							onBeforeConfigureAgents={closeModal}
							triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
							iconClassName="size-3 object-contain"
							allowNone
							noneLabel={t({
								message: "No agent",
							})}
							noneValue="none"
						/>
						{modelSupport && (
							<AgentModelSelect
								models={modelSupport.models}
								value={selectedModel}
								onValueChange={setSelectedModel}
								defaultLabel={t({
									message: "Default model",
								})}
								triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
							/>
						)}
						{effortSupport && (
							<AgentModelSelect
								models={effortOptions}
								value={selectedEffort}
								onValueChange={setSelectedEffort}
								defaultLabel={t({
									message: "Default effort",
								})}
								triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
							/>
						)}
						{modeSupport && (
							<AgentModelSelect
								models={modeSupport.modes}
								value={selectedMode}
								onValueChange={setSelectedMode}
								defaultLabel={t({
									message: "Direct mode",
								})}
								triggerClassName={`${PILL_BUTTON_CLASS} px-1.5 gap-1 text-foreground w-auto max-w-[160px]`}
							/>
						)}
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<AttachmentButtons
							linearIssueTrigger={
								<IssueLinkCommand
									onSelect={addLinkedIssue}
									tooltipLabel={t({
										message: "Link issue",
									})}
								>
									<PromptInputButton
										aria-label={t({
											message: "Link issue",
										})}
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
									hostId={hostId}
									tooltipLabel={t({
										message: "Link GitHub issue",
									})}
								>
									<PromptInputButton
										aria-label={t({
											message: "Link GitHub issue",
										})}
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
									hostId={hostId}
									tooltipLabel={t({
										message: "Link pull request",
									})}
								>
									<PromptInputButton
										aria-label={t({
											message: "Link pull request",
										})}
										className={`${PILL_BUTTON_CLASS} w-[22px]`}
									>
										<LuGitPullRequest className="size-3.5" />
									</PromptInputButton>
								</PRLinkCommand>
							}
						/>
						<PromptInputSubmit
							className="size-[22px] rounded-full border border-transparent bg-foreground/10 shadow-none p-[5px] hover:bg-foreground/20"
							disabled={needsSetup || isCreating}
							onClick={(e) => {
								e.preventDefault();
								handleSubmit();
							}}
						>
							{isCreating ? (
								<Spinner className="size-3.5 text-muted-foreground" />
							) : (
								<ArrowUpIcon className="size-3.5 text-muted-foreground" />
							)}
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>

			{/* Bottom bar */}
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0 flex-1">
					<DevicePicker
						hostId={hostId}
						onSelectHostId={(next) => {
							setLastHostId(next);
							updateDraft({ hostId: next });
						}}
					/>
					{hostId !== CLOUD_HOST_ID && (
						<ProjectPickerPill
							selectedProject={selectedProject}
							projects={recentProjects}
							isSessionSelected={isSessionSelected}
							onSelectProject={onSelectProject}
						/>
					)}
					{hostId === CLOUD_HOST_ID && (
						<EnvironmentPickerPill
							selectedEnvironment={selectedEnvironment}
							environments={environmentOptions}
							onSelectEnvironment={(next) =>
								updateDraft({ environmentId: next })
							}
						/>
					)}
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
								<Trans>based off PR #{linkedPR.prNumber}</Trans>
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
								{!draft.isSession && (
									<CompareBaseBranchPicker {...pickerProps} />
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</div>
				<div className="flex items-center gap-1.5">
					{needsSetup ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-6 px-2 text-[11px] text-amber-500 hover:text-amber-500"
							onClick={handleGoToSetup}
						>
							<Trans>Set up project…</Trans>
						</Button>
					) : (
						<span className="text-[11px] text-muted-foreground/50">
							{modKey}↵
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
