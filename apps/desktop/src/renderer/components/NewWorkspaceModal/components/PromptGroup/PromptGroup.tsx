import {
	AGENT_PRESET_COMMANDS,
	buildAgentPromptCommand,
} from "@superset/shared/agent-command";
import {
	type AgentLaunchRequest,
	STARTABLE_AGENT_LABELS,
	STARTABLE_AGENT_TYPES,
	type StartableAgentType,
} from "@superset/shared/agent-launch";
import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";
import {
	resolveBranchPrefix,
	sanitizeBranchNameWithMaxLength,
} from "shared/utils/branch";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";
import { PromptGroupAdvancedOptions } from "./components/PromptGroupAdvancedOptions";

type WorkspaceCreateAgent = StartableAgentType | "none";

const AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

interface PromptGroupProps {
	projectId: string | null;
}

export function PromptGroup({ projectId }: PromptGroupProps) {
	const navigate = useNavigate();
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const isDark = useIsDarkTheme();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { closeModal, draft, runAsyncAction, updateDraft } =
		useNewWorkspaceModalDraft();
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const {
		baseBranch,
		branchName,
		branchNameEdited,
		branchSearch,
		prompt,
		runSetupScript,
		showAdvanced,
	} = draft;
	const runSetupScriptRef = useRef(runSetupScript);
	runSetupScriptRef.current = runSetupScript;
	const createWorkspace = useCreateWorkspace({
		resolveInitialCommands: (commands) =>
			runSetupScriptRef.current ? commands : null,
	});
	const [selectedAgent, setSelectedAgent] = useState<WorkspaceCreateAgent>(
		() => {
			if (typeof window === "undefined") return "none";
			const stored = window.localStorage.getItem(AGENT_STORAGE_KEY);
			if (stored === "none") return "none";
			return stored &&
				(STARTABLE_AGENT_TYPES as readonly string[]).includes(stored)
				? (stored as WorkspaceCreateAgent)
				: "none";
		},
	);
	const trimmedPrompt = prompt.trim();

	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const {
		data: localBranchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const branchData = remoteBranchData ?? localBranchData;
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: projectId ?? "" },
		{ enabled: !!projectId },
	);
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

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
		return branchData.branches.filter((branch) =>
			branch.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	const effectiveBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: baseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	const branchSlug = branchNameEdited
		? sanitizeBranchNameWithMaxLength(branchName, undefined, {
				preserveFirstSegmentCase: true,
			})
		: sanitizeBranchNameWithMaxLength(trimmedPrompt);

	const applyPrefix = !branchNameEdited;

	const branchPreview =
		branchSlug && applyPrefix && resolvedPrefix
			? sanitizeBranchNameWithMaxLength(`${resolvedPrefix}/${branchSlug}`)
			: branchSlug;

	const previousProjectIdRef = useRef(projectId);

	useEffect(() => {
		if (previousProjectIdRef.current === projectId) {
			return;
		}
		previousProjectIdRef.current = projectId;
		updateDraft({
			baseBranch: null,
			branchSearch: "",
		});
		setBaseBranchOpen(false);
	}, [projectId, updateDraft]);

	const handleAgentChange = (value: WorkspaceCreateAgent) => {
		setSelectedAgent(value);
		window.localStorage.setItem(AGENT_STORAGE_KEY, value);
	};

	const buildLaunchRequest = (
		trimmedPrompt: string,
	): AgentLaunchRequest | null => {
		if (selectedAgent === "none") return null;

		if (selectedAgent === "superset-chat") {
			return {
				kind: "chat",
				workspaceId: "pending-workspace",
				agentType: "superset-chat",
				source: "new-workspace",
				chat: {
					initialPrompt: trimmedPrompt || undefined,
				},
			};
		}

		const command = trimmedPrompt
			? buildAgentPromptCommand({
					prompt: trimmedPrompt,
					randomId: window.crypto.randomUUID(),
					agent: selectedAgent,
				})
			: (AGENT_PRESET_COMMANDS[selectedAgent][0] ?? null);

		if (!command) return null;

		return {
			kind: "terminal",
			workspaceId: "pending-workspace",
			agentType: selectedAgent,
			source: "new-workspace",
			terminal: {
				command,
				name: "Agent",
			},
		};
	};

	const handleCreate = () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		const launchRequest = buildLaunchRequest(trimmedPrompt);
		void runAsyncAction(
			createWorkspace.mutateAsyncWithPendingSetup(
				{
					projectId,
					prompt: trimmedPrompt || undefined,
					branchName: branchSlug || undefined,
					baseBranch: baseBranch || undefined,
					applyPrefix,
				},
				launchRequest ? { agentLaunchRequest: launchRequest } : undefined,
			),
			{
				loading: "Creating workspace...",
				success: "Workspace created",
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
	};

	const handleBranchNameChange = (value: string) => {
		updateDraft({
			branchName: value,
			branchNameEdited: true,
		});
	};

	const handleBranchNameBlur = () => {
		if (!branchName.trim()) {
			updateDraft({
				branchName: "",
				branchNameEdited: false,
			});
		}
	};

	const handleBaseBranchSelect = (selectedBaseBranch: string) => {
		updateDraft({
			baseBranch: selectedBaseBranch,
			branchSearch: "",
		});
		setBaseBranchOpen(false);
	};

	return (
		<div className="p-3 space-y-3">
			<Select
				value={selectedAgent}
				onValueChange={(value: WorkspaceCreateAgent) =>
					handleAgentChange(value)
				}
			>
				<SelectTrigger className="h-8 text-xs w-full">
					<SelectValue placeholder="No agent" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="none">No agent</SelectItem>
					{(STARTABLE_AGENT_TYPES as readonly StartableAgentType[]).map(
						(agent) => {
							const icon = getPresetIcon(agent, isDark);
							return (
								<SelectItem key={agent} value={agent}>
									<span className="flex items-center gap-2">
										{icon && (
											<img
												src={icon}
												alt=""
												className="size-5 object-contain"
											/>
										)}
										{agent === "superset-chat"
											? "Superset"
											: STARTABLE_AGENT_LABELS[agent]}
									</span>
								</SelectItem>
							);
						},
					)}
				</SelectContent>
			</Select>

			<Textarea
				ref={textareaRef}
				className="min-h-24 max-h-48 text-sm resize-y field-sizing-fixed"
				placeholder="What do you want to do?"
				value={prompt}
				onChange={(e) => updateDraft({ prompt: e.target.value })}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						handleCreate();
					}
				}}
			/>

			<PromptGroupAdvancedOptions
				showAdvanced={showAdvanced}
				onShowAdvancedChange={(showAdvanced) => updateDraft({ showAdvanced })}
				branchInputValue={branchNameEdited ? branchName : branchPreview}
				onBranchInputChange={handleBranchNameChange}
				onBranchInputBlur={handleBranchNameBlur}
				onEditPrefix={() => {
					closeModal();
					navigate({ to: "/settings/behavior" });
				}}
				isBranchesError={isBranchesError}
				isBranchesLoading={isBranchesLoading}
				baseBranchOpen={baseBranchOpen}
				onBaseBranchOpenChange={setBaseBranchOpen}
				effectiveBaseBranch={effectiveBaseBranch}
				defaultBranch={branchData?.defaultBranch}
				branchSearch={branchSearch}
				onBranchSearchChange={(branchSearch) => updateDraft({ branchSearch })}
				filteredBranches={filteredBranches}
				onSelectBaseBranch={handleBaseBranchSelect}
				runSetupScript={runSetupScript}
				onRunSetupScriptChange={(runSetupScript) =>
					updateDraft({ runSetupScript })
				}
			/>

			<Button
				className="w-full h-8 text-sm"
				onClick={handleCreate}
				disabled={createWorkspace.isPending}
			>
				Create Workspace
				<KbdGroup className="ml-1.5 opacity-70">
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						{modKey}
					</Kbd>
					<Kbd className="bg-primary-foreground/15 text-primary-foreground h-4 min-w-4 text-[10px]">
						↵
					</Kbd>
				</KbdGroup>
			</Button>
		</div>
	);
}
