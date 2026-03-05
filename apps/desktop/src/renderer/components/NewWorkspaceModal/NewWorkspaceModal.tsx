import {
	AGENT_PRESET_COMMANDS,
	buildAgentPromptCommand,
} from "@superset/shared/agent-command";
import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import { Dialog, DialogContent } from "@superset/ui/dialog";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { launchAgentSession } from "renderer/lib/agent-session-orchestrator";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useOpenProject } from "renderer/react-query/projects";
import {
	useCreateWorkspace,
	useUpdateWorkspace,
} from "renderer/react-query/workspaces";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import {
	resolveBranchPrefix,
	sanitizeBranchNameWithMaxLength,
} from "shared/utils/branch";
import type { ImportSourceTab } from "./components/ExistingWorktreesList";
import { ImportFlow } from "./components/ImportFlow";
import { NewWorkspaceAdvancedOptions } from "./components/NewWorkspaceAdvancedOptions";
import {
	NewWorkspaceCreateFlow,
	type WorkspaceCreateAgent,
} from "./components/NewWorkspaceCreateFlow";
import { NewWorkspaceHeader } from "./components/NewWorkspaceHeader";
import { ProjectSelector } from "./components/ProjectSelector";

type Mode = "existing" | "new";
const WORKSPACE_AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

export function NewWorkspaceModal() {
	const navigate = useNavigate();
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const preSelectedProjectId = usePreSelectedProjectId();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [title, setTitle] = useState("");
	const [branchName, setBranchName] = useState("");
	const [branchNameEdited, setBranchNameEdited] = useState(false);
	const [mode, setMode] = useState<Mode>("new");
	const [baseBranch, setBaseBranch] = useState<string | null>(null);
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [runSetupScript, setRunSetupScript] = useState(true);
	const [importTab, setImportTab] = useState<ImportSourceTab>("pull-request");
	const [selectedAgent, setSelectedAgent] = useState<WorkspaceCreateAgent>(
		() => {
			if (typeof window === "undefined") return "none";
			const stored = window.localStorage.getItem(WORKSPACE_AGENT_STORAGE_KEY);
			if (stored === "none") return "none";
			return stored &&
				(STARTABLE_AGENT_TYPES as readonly string[]).includes(stored)
				? (stored as WorkspaceCreateAgent)
				: "none";
		},
	);
	const runSetupScriptRef = useRef(true);
	runSetupScriptRef.current = runSetupScript;
	const titleInputRef = useRef<HTMLTextAreaElement>(null);

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const {
		data: branchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranches.useQuery(
		{ projectId: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const createWorkspace = useCreateWorkspace({
		resolveInitialCommands: (commands) =>
			runSetupScriptRef.current ? commands : null,
	});
	const updateWorkspace = useUpdateWorkspace();
	const generateName = electronTrpc.workspaces.generateName.useMutation();
	const { openNew } = useOpenProject();
	const selectableAgents =
		STARTABLE_AGENT_TYPES as readonly StartableAgentType[];

	const resolvedPrefix = useMemo(() => {
		const projectOverrides = project?.branchPrefixMode != null;
		return resolveBranchPrefix({
			mode: projectOverrides
				? project?.branchPrefixMode
				: (globalBranchPrefix?.mode ?? "none"),
			customPrefix: projectOverrides
				? project?.branchPrefixCustom
				: globalBranchPrefix?.customPrefix,
			authorPrefix: gitAuthor?.prefix,
			githubUsername: gitInfo?.githubUsername,
		});
	}, [project, globalBranchPrefix, gitAuthor, gitInfo]);

	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset form each time the modal opens
	useEffect(() => {
		if (!isOpen) return;
		resetForm();
		if (preSelectedProjectId) {
			setSelectedProjectId(preSelectedProjectId);
		}
	}, [isOpen]);

	useEffect(() => {
		if (selectedAgent === "none") return;
		if ((STARTABLE_AGENT_TYPES as readonly string[]).includes(selectedAgent)) {
			return;
		}
		setSelectedAgent("none");
		window.localStorage.setItem(WORKSPACE_AGENT_STORAGE_KEY, "none");
	}, [selectedAgent]);

	const effectiveBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: baseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when project changes
	useEffect(() => {
		setBaseBranch(null);
	}, [selectedProjectId]);

	const branchSlug = branchNameEdited
		? sanitizeBranchNameWithMaxLength(branchName)
		: "";

	const applyPrefix = !branchNameEdited;

	const branchPreview =
		branchSlug && applyPrefix && resolvedPrefix
			? sanitizeBranchNameWithMaxLength(`${resolvedPrefix}/${branchSlug}`)
			: branchSlug;

	const resetForm = () => {
		setSelectedProjectId(null);
		setTitle("");
		setBranchName("");
		setBranchNameEdited(false);
		setMode("new");
		setImportTab("pull-request");
		setBaseBranch(null);
		setBranchSearch("");
		setShowAdvanced(false);
		setRunSetupScript(true);
	};

	useEffect(() => {
		if (isOpen && selectedProjectId && mode === "new") {
			const timer = setTimeout(() => titleInputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedProjectId, mode]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		const isTextareaTarget = e.target instanceof HTMLTextAreaElement;
		const isSubmitShortcutInTextarea =
			isTextareaTarget && (e.metaKey || e.ctrlKey);

		if (isTextareaTarget && !isSubmitShortcutInTextarea) {
			return;
		}

		if (
			e.key === "Enter" &&
			!e.shiftKey &&
			mode === "new" &&
			selectedProjectId &&
			!createWorkspace.isPending
		) {
			e.preventDefault();
			handleCreateWorkspace();
		}
	};

	const handleClose = () => {
		closeModal();
		resetForm();
	};

	const handleBranchNameChange = (value: string) => {
		setBranchName(value);
		setBranchNameEdited(true);
	};

	const handleBranchNameBlur = () => {
		if (!branchName.trim()) {
			setBranchName("");
			setBranchNameEdited(false);
		}
	};

	const handleImportRepo = async () => {
		try {
			const projects = await openNew();

			if (projects.length > 1) {
				toast.success(`${projects.length} projects imported`);
			}

			if (projects.length > 0) {
				setSelectedProjectId(projects[0].id);
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);
	const projectSelector = (
		<ProjectSelector
			selectedProjectId={selectedProjectId}
			selectedProjectName={selectedProject?.name ?? null}
			recentProjects={recentProjects.filter((project) => Boolean(project.id))}
			onSelectProject={setSelectedProjectId}
			onImportRepo={handleImportRepo}
		/>
	);
	const isCreateDisabled = createWorkspace.isPending || isBranchesError;
	const buildLaunchRequestForWorkspace = (
		workspaceId: string,
		prompt: string,
	): AgentLaunchRequest | null => {
		if (selectedAgent === "none") {
			return null;
		}

		if (selectedAgent === "superset-chat") {
			return {
				kind: "chat",
				workspaceId,
				agentType: "superset-chat",
				source: "new-workspace",
				chat: {
					initialPrompt: prompt || undefined,
					retryCount: 1,
				},
			};
		}

		const command = prompt
			? buildAgentPromptCommand({
					prompt,
					randomId: window.crypto.randomUUID(),
					agent: selectedAgent,
				})
			: (AGENT_PRESET_COMMANDS[selectedAgent][0] ?? null);

		if (!command) {
			return null;
		}

		return {
			kind: "terminal",
			workspaceId,
			agentType: selectedAgent,
			source: "new-workspace",
			terminal: {
				command,
				name: "Agent",
			},
		};
	};

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId) return;
		// Keep the agent prompt uncapped; only trim surrounding whitespace.
		const prompt = title.trim();

		const workspaceName = undefined;
		const launchRequestTemplate = buildLaunchRequestForWorkspace(
			"pending-workspace",
			prompt,
		);

		closeModal();

		try {
			const result = await createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId: selectedProjectId,
					name: workspaceName,
					branchName: branchSlug || undefined,
					baseBranch: baseBranch || undefined,
					applyPrefix,
				},
				launchRequestTemplate
					? { agentLaunchRequest: launchRequestTemplate }
					: undefined,
			);

			if (prompt && !result.wasExisting) {
				generateName
					.mutateAsync({ prompt })
					.then((res) => {
						if (res.name) {
							updateWorkspace.mutate({
								id: result.workspace.id,
								patch: { name: res.name, isUnnamed: false },
							});
						}
					})
					.catch(() => {});
			}

			const launchRequest = launchRequestTemplate
				? {
						...launchRequestTemplate,
						workspaceId: result.workspace.id,
					}
				: null;

			if (launchRequest && result.wasExisting) {
				const launchResult = await launchAgentSession(launchRequest, {
					source: "new-workspace",
					createOrAttach: (input) => terminalCreateOrAttach.mutateAsync(input),
					write: (input) => terminalWrite.mutateAsync(input),
				});
				if (launchResult.status === "failed") {
					toast.error("Failed to start agent", {
						description: launchResult.error ?? "Failed to start agent session.",
					});
				}
			}

			if (result.wasExisting) {
				toast.success("Opened existing workspace");
			} else if (result.isInitializing) {
				toast.success("Workspace created", {
					description: "Setting up in the background...",
				});
			} else {
				toast.success("Workspace created");
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	const handleAgentChange = (value: WorkspaceCreateAgent) => {
		setSelectedAgent(value);
		window.localStorage.setItem(WORKSPACE_AGENT_STORAGE_KEY, value);
	};

	const handleBaseBranchSelect = (branchName: string) => {
		setBaseBranch(branchName);
		setBaseBranchOpen(false);
		setBranchSearch("");
	};

	const advancedOptions = (
		<NewWorkspaceAdvancedOptions
			showAdvanced={showAdvanced}
			onShowAdvancedChange={setShowAdvanced}
			branchInputValue={branchNameEdited ? branchName : branchPreview}
			onBranchInputChange={handleBranchNameChange}
			onBranchInputBlur={handleBranchNameBlur}
			onEditPrefix={() => {
				handleClose();
				navigate({ to: "/settings/behavior" });
			}}
			isBranchesError={isBranchesError}
			isBranchesLoading={isBranchesLoading}
			baseBranchOpen={baseBranchOpen}
			onBaseBranchOpenChange={setBaseBranchOpen}
			effectiveBaseBranch={effectiveBaseBranch}
			defaultBranch={branchData?.defaultBranch}
			branchSearch={branchSearch}
			onBranchSearchChange={setBranchSearch}
			filteredBranches={filteredBranches}
			onSelectBaseBranch={handleBaseBranchSelect}
			runSetupScript={runSetupScript}
			onRunSetupScriptChange={setRunSetupScript}
		/>
	);

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent
				className="sm:max-w-[440px] gap-0 p-0 overflow-hidden"
				onKeyDown={handleKeyDown}
				showCloseButton={false}
			>
				<NewWorkspaceHeader
					mode={mode}
					hasSelectedProject={!!selectedProjectId}
					onBackToNew={() => setMode("new")}
					onOpenImport={() => setMode("existing")}
				/>

				{!selectedProjectId && (
					<div className="px-4 pb-3">{projectSelector}</div>
				)}

				{selectedProjectId && (
					<div className="px-4 pb-4 min-w-0">
						{mode === "new" && (
							<NewWorkspaceCreateFlow
								projectSelector={projectSelector}
								selectedAgent={selectedAgent}
								agentOptions={selectableAgents}
								onSelectedAgentChange={handleAgentChange}
								title={title}
								onTitleChange={setTitle}
								titleInputRef={titleInputRef}
								showBranchPreview={branchNameEdited}
								branchPreview={branchPreview}
								effectiveBaseBranch={effectiveBaseBranch}
								onCreateWorkspace={handleCreateWorkspace}
								isCreateDisabled={isCreateDisabled}
								advancedOptions={advancedOptions}
							/>
						)}
						{mode === "existing" && (
							<ImportFlow
								projectId={selectedProjectId}
								projectSelector={projectSelector}
								onOpenSuccess={handleClose}
								activeTab={importTab}
								onActiveTabChange={setImportTab}
							/>
						)}
					</div>
				)}

				{!selectedProjectId && (
					<div className="px-4 pb-4 pt-2">
						<div className="text-center text-sm text-muted-foreground py-8">
							Select a project to get started
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
