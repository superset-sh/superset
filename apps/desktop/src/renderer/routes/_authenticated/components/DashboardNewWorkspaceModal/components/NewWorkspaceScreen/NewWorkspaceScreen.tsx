import { Trans, useLingui } from "@lingui/react/macro";
import {
	getAgentEffortSupport,
	getAgentEfforts,
	getAgentModelSupport,
	getAgentModeSupport,
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
import { Spinner } from "@superset/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowUpIcon,
	HistoryIcon,
	PaperclipIcon,
	Settings2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoIssueOpened } from "react-icons/go";
import { LuGitPullRequest } from "react-icons/lu";
import { SiLinear } from "react-icons/si";
import { AgentModelSelect } from "renderer/components/AgentModelSelect";
import { AgentSelect } from "renderer/components/AgentSelect";
import { GitHubStarPill } from "renderer/components/GitHubStarPill";
import { IssueLinkCommand } from "renderer/components/IssueLinkCommand";
import { LinkedIssuePill } from "renderer/components/LinkedIssuePill";
import { MarkdownEditor } from "renderer/components/MarkdownEditor";
import { useHostProjects } from "renderer/hooks/host-projects/useHostProjects";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useAgentEffortPreference } from "renderer/hooks/useAgentEffortPreference";
import { useAgentLaunchPreferences } from "renderer/hooks/useAgentLaunchPreferences";
import { useAgentModelPreference } from "renderer/hooks/useAgentModelPreference";
import { useAgentModePreference } from "renderer/hooks/useAgentModePreference";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useV2AgentChoices } from "renderer/hooks/useV2AgentChoices";
import { CLOUD_AGENT_CHOICES } from "renderer/hooks/useV2AgentChoices/cloud-agent-choices";
import { track } from "renderer/lib/analytics";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import { SupersetIcon } from "renderer/routes/_authenticated/onboarding/providers/components/SupersetIcon";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { newWorkspaceAttachmentPaths } from "renderer/stores/new-workspace-attachments";
import { useNewWorkspacePromptContext } from "renderer/stores/new-workspace-prompt-context";
import {
	NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH,
	NEW_WORKSPACE_SCREEN_MAX_WIDTH,
	NEW_WORKSPACE_SCREEN_MIN_WIDTH,
	useNewWorkspaceWidthStore,
} from "renderer/stores/new-workspace-width";
import { useV2WorkspaceCreateDefaultsStore } from "renderer/stores/v2-workspace-create-defaults";
import { useDashboardNewWorkspaceDraft } from "../../DashboardNewWorkspaceDraftContext";
import {
	type PromptCardsVariant,
	useNewWorkspacePromptCardsVariant,
} from "../../hooks/useNewWorkspacePromptCardsVariant";
import { DevicePicker } from "../DashboardNewWorkspaceForm/components/DevicePicker";
import { CLOUD_HOST_ID } from "../DashboardNewWorkspaceForm/components/DevicePicker/DevicePicker";
import { useWorkspaceHostOptions } from "../DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions";
import { CompareBaseBranchPicker } from "../DashboardNewWorkspaceForm/PromptGroup/components/CompareBaseBranchPicker";
import { EnvironmentPickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/EnvironmentPickerPill";
import { GitHubIssueLinkCommand } from "../DashboardNewWorkspaceForm/PromptGroup/components/GitHubIssueLinkCommand";
import { LinkedGitHubIssuePill } from "../DashboardNewWorkspaceForm/PromptGroup/components/LinkedGitHubIssuePill";
import { LinkedPRPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/LinkedPRPill";
import { PRLinkCommand } from "../DashboardNewWorkspaceForm/PromptGroup/components/PRLinkCommand";
import { ProjectPickerPill } from "../DashboardNewWorkspaceForm/PromptGroup/components/ProjectPickerPill";
import { PromptHistoryCommand } from "../DashboardNewWorkspaceForm/PromptGroup/components/PromptHistoryCommand";
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
	MODE_STORAGE_KEY,
	MODEL_STORAGE_KEY,
	PILL_BUTTON_CLASS,
	type WorkspaceCreateAgent,
} from "../DashboardNewWorkspaceForm/PromptGroup/types";
import { useSelectedHostProjectIds } from "../DashboardNewWorkspaceModalContent/hooks/useSelectedHostProjectIds";
import { SymmetricResizeHandles } from "../SymmetricResizeHandles";
import { AttachmentCard } from "./components/AttachmentCard";
import { SamplePromptCards } from "./components/SamplePromptCards";
import { SamplePrompts } from "./components/SamplePrompts";
import { PROMPT_PLACEHOLDERS } from "./components/SamplePrompts/constants";
import { useSamplePromptSelection } from "./hooks/useSamplePromptSelection";

/** Nested prefixes of one fixed pool — only the form factor varies by arm. */
const PROMPT_COUNTS: Record<PromptCardsVariant, number> = {
	control: 3,
	cards2: 2,
	cards4: 4,
};

const PROMPT_LAYOUTS: Record<PromptCardsVariant, string> = {
	control: "rows",
	cards2: "cards2",
	cards4: "cards4",
};

interface NewWorkspaceScreenProps {
	isOpen: boolean;
	preSelectedProjectId: string | null;
	/** Open with "No project" (session) preselected. */
	preSelectedSession?: boolean;
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
	preSelectedSession = false,
}: NewWorkspaceScreenProps) {
	const { t } = useLingui();
	const navigate = useNavigate();
	const [promptSeed, setPromptSeed] = useState(0);
	const openInFinderMutation = electronTrpc.external.openInFinder.useMutation();
	const {
		closeModal,
		draft,
		updateDraft,
		selectProject,
		selectSession,
		resetKey,
	} = useDashboardNewWorkspaceDraft();
	const attachments = useProviderAttachments();
	const hostService = useLocalHostService();
	const { activeHostUrl, machineId } = hostService;
	const relayUrl = useRelayUrl();
	const activeOrganizationId = useActiveOrganizationId();

	const environmentsQuery = cloudTrpc.environment.list.useQuery(
		{ organizationId: activeOrganizationId ?? "" },
		{ enabled: draft.hostId === CLOUD_HOST_ID && !!activeOrganizationId },
	);
	const environmentOptions = environmentsQuery.data ?? [];
	const selectedEnvironment =
		environmentOptions.find((row) => row.id === draft.environmentId) ??
		environmentOptions[0];
	const setLastProjectId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastProjectId,
	);
	const setLastHostId = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setLastHostId,
	);
	const samplePromptsDismissed = useV2WorkspaceCreateDefaultsStore(
		(state) => state.samplePromptsDismissed,
	);
	const setSamplePromptsDismissed = useV2WorkspaceCreateDefaultsStore(
		(state) => state.setSamplePromptsDismissed,
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
	useEffect(() => {
		if (!isOpen) return;
		let timer: number | null = null;
		const recordPaths = (files: FileList | null | undefined) => {
			for (const file of Array.from(files ?? [])) {
				try {
					const path = window.webUtils.getPathForFile(file);
					if (!path) continue;
					// Attachment items only expose the basename, so the map is
					// name-keyed; a second same-named file from elsewhere makes the
					// name ambiguous — poison it so no card reveals the wrong file.
					const existing = newWorkspaceAttachmentPaths.get(file.name);
					newWorkspaceAttachmentPaths.set(
						file.name,
						existing !== undefined && existing !== path ? "" : path,
					);
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

	// Apply the URL preselection exactly once (ref-guarded like the control
	// modal) — re-applying on every draft change would snap the picker back
	// and make switching projects impossible.
	const appliedPreSelectionRef = useRef<string | null>(null);
	const appliedSessionPreselectionRef = useRef(false);
	// Re-arm per intent so a second session-open cycle on a reused screen
	// instance applies again.
	useEffect(() => {
		if (!preSelectedSession) appliedSessionPreselectionRef.current = false;
	}, [preSelectedSession]);
	useEffect(() => {
		if (!preSelectedProjectId) appliedPreSelectionRef.current = null;
	}, [preSelectedProjectId]);
	useEffect(() => {
		if (!isOpen || !areProjectsReady) return;
		if (preSelectedSession && !appliedSessionPreselectionRef.current) {
			appliedSessionPreselectionRef.current = true;
			selectSession();
			return;
		}
		const isValid = (id: string | null | undefined) =>
			Boolean(id && projects.some((project) => project.id === id));
		if (
			preSelectedProjectId &&
			preSelectedProjectId !== appliedPreSelectionRef.current &&
			isValid(preSelectedProjectId)
		) {
			appliedPreSelectionRef.current = preSelectedProjectId;
			selectProject(preSelectedProjectId);
			return;
		}
		// An explicit "No project" (session) choice must survive project-list
		// updates — never auto-select over it.
		if (draft.isSession) return;
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
		preSelectedSession,
		draft.selectedProjectId,
		draft.isSession,
		projects,
		selectProject,
		selectSession,
		updateDraft,
	]);

	const storedComposerWidth = useNewWorkspaceWidthStore(
		(state) => state.screenWidth,
	);
	const setStoredComposerWidth = useNewWorkspaceWidthStore(
		(state) => state.setScreenWidth,
	);
	/** Width while a resize drag is in flight; persisted on release. */
	const [liveComposerWidth, setLiveComposerWidth] = useState<number | null>(
		null,
	);
	const composerWidth = liveComposerWidth ?? storedComposerWidth;

	// One suggestion per open. resetKey only bumps on resetDraft, so ordinary
	// modal reopens roll their own counter; the tiptap Placeholder extension
	// freezes its text at editor mount, so the roll also rides the editor key.
	const [placeholderRoll, setPlaceholderRoll] = useState(0);
	const wasOpenRef = useRef(isOpen);
	useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			setPlaceholderRoll((roll) => roll + 1);
		}
		wasOpenRef.current = isOpen;
	}, [isOpen]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-roll per draft reset and per open
	const promptPlaceholder = useMemo(() => {
		const descriptor =
			PROMPT_PLACEHOLDERS[
				Math.floor(Math.random() * PROMPT_PLACEHOLDERS.length)
			];
		return descriptor
			? t(descriptor)
			: t({
					message: "What do you want to do?",
				});
	}, [resetKey, placeholderRoll, t]);

	const projectId = draft.selectedProjectId;
	const selectedProject = projects.find((project) => project.id === projectId);
	const needsSetup = selectedProject?.needsSetup === true;
	const isPromptEmpty = !draft.prompt.trim();
	// The markdown editor is uncontrolled after mount, so programmatic prompt
	// insertion bumps promptSeed to remount it with the new content.
	const applyPrompt = useCallback(
		(prompt: string) => {
			updateDraft({ prompt });
			setPromptSeed((seed) => seed + 1);
		},
		[updateDraft],
	);
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
		// A cloud workspace's sandbox doesn't exist yet, and "cloud" is a
		// sentinel — resolving it would address a machine that isn't there.
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

	const promptCardsVariant = useNewWorkspacePromptCardsVariant(isOpen);
	const promptLayout =
		promptCardsVariant === null ? "rows" : PROMPT_LAYOUTS[promptCardsVariant];

	// One signal drives both the prompt tier and the dismiss affordance: has
	// this person shipped anything yet. `main` is auto-created for every new
	// account, so it cannot count.
	const { workspaces: hostWorkspaces } = useHostWorkspaces();
	const hasRealWorkspace = hostWorkspaces.some(
		(workspace) => workspace.type !== "main",
	);

	const samplePromptTier = hasRealWorkspace ? "returning" : "first-run";
	const { prompts: samplePrompts, isPending: samplePromptsPending } =
		useSamplePromptSelection(
			samplePromptTier,
			launchHostUrl,
			projectId,
			promptCardsVariant === null ? 0 : PROMPT_COUNTS[promptCardsVariant],
		);

	// Logged so the prompt-cards experiment can account for lost exposure.
	const handleDismissSamplePrompts = useCallback(() => {
		track("new_workspace_sample_prompts_dismissed", { layout: promptLayout });
		setSamplePromptsDismissed(true);
	}, [promptLayout, setSamplePromptsDismissed]);

	const { agents: hostAgents, isFetched: hostAgentsFetched } =
		useV2AgentChoices(launchHostUrl);
	// Under Cloud the built-in presets stand in for a host's agent list.
	const v2Agents =
		draft.hostId === CLOUD_HOST_ID ? CLOUD_AGENT_CHOICES : hostAgents;
	const v2AgentsFetched = draft.hostId === CLOUD_HOST_ID || hostAgentsFetched;
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
	// Codex's top two efforts only exist on its GPT-5.6 models and cursor-agent
	// has a ladder for only some models, so the offered list follows the model
	// picker and the control disappears when there is nothing to offer. A
	// remembered effort the current model rejects stays stored but shows (and
	// launches) as the agent default.
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
	const { submitWorkspace: createWorkspace, isCreating } = useSubmitWorkspace(
		projectId,
		selectedAgent,
		modelSupport ? selectedModel : null,
		effortForLaunch,
		modeSupport ? selectedMode : null,
		uploadAttachments,
		promptContext,
	);

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
			const remote = otherHosts.find((host) => host.id === selectedHostId);
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
							<Trans>Drop to attach</Trans>
						</span>
					</motion.div>
				)}
			</AnimatePresence>
			{/* no-drag + clear of the page's window-drag strip (which ends at
			    right-12) so the button actually receives clicks. */}
			<div className="no-drag absolute right-3 top-2.5 z-10 flex items-center gap-0.5">
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
								className="size-7 text-muted-foreground"
								onClick={handleGoToNamingInstructions}
							>
								<Settings2Icon className="size-4" />
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
						className="size-7 text-muted-foreground"
					>
						<HistoryIcon className="size-4" />
					</Button>
				</PromptHistoryCommand>
			</div>
			<div className="flex flex-1 flex-col items-center justify-center gap-8">
				<SupersetIcon className="h-10 w-auto text-muted-foreground/70" />
				<h1 className="text-center text-3xl font-medium text-foreground/90">
					<Trans>What should we build next?</Trans>
				</h1>
				<GitHubStarPill surface="new_workspace" reserveSpace />
			</div>
			<div className="flex w-full flex-col items-center px-6 pb-8">
				<div
					className="relative flex w-full flex-col"
					style={{
						maxWidth: composerWidth ?? NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH,
					}}
				>
					<AnimatePresence initial={false}>
						{isPromptEmpty &&
							promptCardsVariant !== null &&
							!samplePromptsPending &&
							!samplePromptsDismissed && (
								<motion.div
									key="sample-prompts"
									initial={{ opacity: 0, y: 12 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, transition: { duration: 0 } }}
									transition={{
										type: "tween",
										duration: 0.15,
										ease: "easeOut",
									}}
									// In flow, not absolute: the heading above is the flex-1
									// spacer, so it absorbs this block's height and the composer
									// stays put. Positioning it out of flow let tall suggestion
									// sets overlap the heading instead.
									className="mb-1"
								>
									{promptCardsVariant === "control" ? (
										<SamplePrompts
											prompts={samplePrompts}
											onSelect={applyPrompt}
											onDismiss={handleDismissSamplePrompts}
											canDismiss={hasRealWorkspace}
											tier={samplePromptTier}
										/>
									) : (
										<SamplePromptCards
											prompts={samplePrompts}
											onSelect={applyPrompt}
											onDismiss={handleDismissSamplePrompts}
											canDismiss={hasRealWorkspace}
											layout={promptLayout}
											tier={samplePromptTier}
										/>
									)}
								</motion.div>
							)}
					</AnimatePresence>
					<PromptInput
						onSubmit={handleSubmit}
						multiple
						globalDrop
						maxFiles={5}
						maxFileSize={10 * 1024 * 1024}
						onError={(error) => toast.error(error.message)}
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
										? newWorkspaceAttachmentPaths.get(file.filename) || null
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
							key={`${resetKey}-${promptSeed}-${placeholderRoll}`}
							content={draft.prompt}
							onChange={(markdown) => updateDraft({ prompt: markdown })}
							onPasteFiles={(files) => attachments.add(files)}
							onEnterSubmit={handleSubmit}
							autoFocus={draft.prompt ? "end" : "start"}
							placeholder={promptPlaceholder}
							className="flex flex-col min-h-[80px] max-h-[min(50vh,600px)] px-3 pt-3"
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
								{effortSupport && effortOptions.length > 0 && (
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
								<PRLinkCommand
									onSelect={setLinkedPR}
									projectId={projectId}
									hostId={draft.hostId}
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
								<Tooltip>
									<TooltipTrigger asChild>
										<PromptInputButton
											aria-label={t({
												message: "Add attachment",
											})}
											className={`${PILL_BUTTON_CLASS} w-[22px]`}
											onClick={() => attachments.openFileDialog()}
										>
											<PaperclipIcon className="size-3.5" />
										</PromptInputButton>
									</TooltipTrigger>
									<TooltipContent side="bottom">
										<Trans>Add attachment</Trans>
									</TooltipContent>
								</Tooltip>
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
					<div className="mt-2 flex items-center justify-between gap-2">
						<div className="flex min-w-0 flex-1 items-center gap-2">
							<DevicePicker
								hostId={draft.hostId}
								onSelectHostId={(next) => {
									setLastHostId(next);
									updateDraft({ hostId: next });
								}}
							/>
							{draft.hostId !== CLOUD_HOST_ID && (
								<ProjectPickerPill
									selectedProject={selectedProject}
									projects={projects}
									isSessionSelected={draft.isSession}
									onSelectProject={(selectedProjectId) => {
										if (selectedProjectId === null) {
											selectSession();
											return;
										}
										setLastProjectId(selectedProjectId);
										selectProject(selectedProjectId);
									}}
								/>
							)}
							{draft.hostId === CLOUD_HOST_ID && (
								<EnvironmentPickerPill
									selectedEnvironment={selectedEnvironment}
									environments={environmentOptions}
									onSelectEnvironment={(next) =>
										updateDraft({ environmentId: next })
									}
								/>
							)}
							{draft.linkedPR ? (
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<LuGitPullRequest className="size-3 shrink-0" />
									<Trans>based off PR #{draft.linkedPR.prNumber}</Trans>
								</span>
							) : draft.isSession ? null : (
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
								<Trans>Set up project…</Trans>
							</Button>
						)}
					</div>
					<SymmetricResizeHandles
						currentWidth={composerWidth ?? NEW_WORKSPACE_SCREEN_DEFAULT_WIDTH}
						minWidth={NEW_WORKSPACE_SCREEN_MIN_WIDTH}
						maxWidth={NEW_WORKSPACE_SCREEN_MAX_WIDTH}
						onWidthChange={setLiveComposerWidth}
						onWidthCommit={(width) => {
							setStoredComposerWidth(width);
							setLiveComposerWidth(null);
						}}
						onReset={() => {
							setStoredComposerWidth(null);
							setLiveComposerWidth(null);
						}}
					/>
				</div>
			</div>
		</div>
	);
}
