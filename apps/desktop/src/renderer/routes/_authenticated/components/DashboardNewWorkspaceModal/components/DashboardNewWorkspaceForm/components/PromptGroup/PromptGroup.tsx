import { Button } from "@superset/ui/button";
import { Kbd, KbdGroup } from "@superset/ui/kbd";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PLATFORM } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import {
	resolveBranchPrefix,
	sanitizeBranchNameWithMaxLength,
} from "shared/utils/branch";
import { useDashboardNewWorkspaceDraft } from "../../../../DashboardNewWorkspaceDraftContext";
import { useCreateDashboardWorkspace } from "../../../../hooks/useCreateDashboardWorkspace";
import { PromptGroupAdvancedOptions } from "./components/PromptGroupAdvancedOptions";

interface PromptGroupProps {
	projectId: string | null;
	localProjectId: string | null;
	hostTarget: WorkspaceHostTarget;
}

export function PromptGroup({
	projectId,
	localProjectId,
	hostTarget,
}: PromptGroupProps) {
	const navigate = useNavigate();
	const modKey = PLATFORM === "mac" ? "⌘" : "Ctrl";
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { closeModal, draft, runAsyncAction, updateDraft } =
		useDashboardNewWorkspaceDraft();
	const [compareBaseBranchOpen, setCompareBaseBranchOpen] = useState(false);
	const {
		compareBaseBranch,
		branchName,
		branchNameEdited,
		branchSearch,
		prompt,
		showAdvanced,
	} = draft;
	const { createWorkspace, isPending } = useCreateDashboardWorkspace();

	const trimmedPrompt = prompt.trim();

	const hasLocalProject = !!localProjectId;

	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: localProjectId ?? "" },
		{ enabled: hasLocalProject },
	);
	const {
		data: localBranchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranchesLocal.useQuery(
		{ projectId: localProjectId ?? "" },
		{ enabled: hasLocalProject },
	);
	const { data: remoteBranchData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: localProjectId ?? "" },
		{ enabled: hasLocalProject },
	);
	const branchData = remoteBranchData ?? localBranchData;
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: localProjectId ?? "" },
		{ enabled: hasLocalProject },
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

	const effectiveCompareBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: compareBaseBranch,
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

	const previousProjectIdRef = useRef(localProjectId);

	useEffect(() => {
		if (previousProjectIdRef.current === localProjectId) {
			return;
		}
		previousProjectIdRef.current = localProjectId;
		updateDraft({
			compareBaseBranch: null,
			branchSearch: "",
		});
		setCompareBaseBranchOpen(false);
	}, [localProjectId, updateDraft]);

	const handleCreate = () => {
		if (!projectId) {
			toast.error("Select a project first");
			return;
		}
		const name = branchSlug || trimmedPrompt || "workspace";
		const branch = branchPreview || "workspace";
		void runAsyncAction(
			createWorkspace({
				projectId,
				name,
				branch,
				hostTarget,
			}),
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

	const handleCompareBaseBranchSelect = (selectedBaseBranch: string) => {
		updateDraft({
			compareBaseBranch: selectedBaseBranch,
			branchSearch: "",
		});
		setCompareBaseBranchOpen(false);
	};

	return (
		<div className="px-4 py-4 space-y-3">
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

			{hasLocalProject && (
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
					compareBaseBranchOpen={compareBaseBranchOpen}
					onCompareBaseBranchOpenChange={setCompareBaseBranchOpen}
					effectiveCompareBaseBranch={effectiveCompareBaseBranch}
					defaultBranch={branchData?.defaultBranch}
					branchSearch={branchSearch}
					onBranchSearchChange={(branchSearch) => updateDraft({ branchSearch })}
					filteredBranches={filteredBranches}
					onSelectCompareBaseBranch={handleCompareBaseBranchSelect}
					runSetupScript={false}
					onRunSetupScriptChange={() => {}}
					hideSetupScript
				/>
			)}

			<Button
				className="w-full h-8 text-sm"
				onClick={handleCreate}
				disabled={isPending}
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
