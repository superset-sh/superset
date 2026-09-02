import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import { LuGitCompareArrows } from "react-icons/lu";
import { useChangeset } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";
import { useWorkspaceGitStatus } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/providers/WorkspaceGitStatusProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type {
	ChangesFilter,
	ChangesViewMode,
} from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { SidebarTabDefinition } from "../../types";
import { ChangesTabContent } from "./components/ChangesTabContent";

export interface SelectedDiffTarget {
	/** Worktree-relative path of the file the diff pane last navigated to. */
	path: string;
	/** Disambiguates a path present in several sections (staged + unstaged). */
	changeKey?: string;
}

interface UseChangesTabParams {
	workspaceId: string;
	/** The diff pane's current target — echoed back as the row highlight. */
	selectedDiffTarget?: SelectedDiffTarget;
	/** openInNewTab=false navigates the workspace's diff pane; true opens a new diff tab. */
	onSelectFile?: (
		path: string,
		openInNewTab?: boolean,
		changeKey?: string,
	) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
}

/**
 * The sidebar's Changes tab: one scope row (commit filter, "vs <base>",
 * view-mode and fold utilities) over the sectioned changed-files list with
 * per-section diffstats, staging, hover discard, context menus, and
 * drag-to-terminal. Rows navigate the workspace's diff pane through
 * onSelectFile, and the pane's target comes back as selectedDiffTarget so the
 * list highlights what the pane is showing. Re-renders on any sidebarState
 * change through useSidebarDiffRef's whole-row live query, so the plain
 * collection reads below stay fresh.
 */
export function useChangesTab({
	workspaceId,
	selectedDiffTarget,
	onSelectFile,
	onOpenFile,
}: UseChangesTabParams): SidebarTabDefinition {
	const { t } = useLingui();
	const status = useWorkspaceGitStatus();
	const collections = useCollections();
	const utils = workspaceTrpc.useUtils();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const filter: ChangesFilter = localState?.sidebarState?.changesFilter ?? {
		kind: "all",
	};
	const viewMode: ChangesViewMode =
		localState?.sidebarState?.changesViewMode ?? "folders";

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({
		workspaceId,
		ref,
	});

	const workspaceQuery = workspaceTrpc.workspace.get.useQuery({
		id: workspaceId,
	});
	const worktreePath = workspaceQuery.data?.worktreePath;
	const openInExternalEditor = useOpenInExternalEditor(workspaceId);

	const handleOpenInEditor = useCallback(
		(relativePath: string) => {
			if (!worktreePath) return;
			openInExternalEditor(toAbsoluteWorkspacePath(worktreePath, relativePath));
		},
		[worktreePath, openInExternalEditor],
	);

	const setFilter = useCallback(
		(next: ChangesFilter) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesFilter = next;
			});
		},
		[collections, workspaceId],
	);

	const setViewMode = useCallback(
		(next: ChangesViewMode) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesViewMode = next;
			});
		},
		[collections, workspaceId],
	);

	const setBaseBranchMutation = workspaceTrpc.git.setBaseBranch.useMutation({
		onSuccess: () => {
			void utils.git.getBaseBranch.invalidate({ workspaceId });
			void utils.git.getStatus.invalidate({ workspaceId });
			void utils.git.listCommits.invalidate({ workspaceId });
			void utils.git.getDiff.invalidate({ workspaceId });
		},
		// The picker re-renders from getBaseBranch, so a rejected change
		// silently snaps back without this.
		onError: (error) =>
			toast.error(
				error.message ||
					t({
						message: "Failed to change base branch",
					}),
			),
	});

	const setBaseBranch = useCallback(
		(branchName: string | null) => {
			setBaseBranchMutation.mutate({ workspaceId, baseBranch: branchName });
		},
		[setBaseBranchMutation, workspaceId],
	);

	const commits = workspaceTrpc.git.listCommits.useQuery(
		{ workspaceId, baseBranch: baseBranch ?? undefined },
		{ refetchOnWindowFocus: true },
	);

	const branches = workspaceTrpc.git.listBranches.useQuery(
		{ workspaceId },
		{ refetchInterval: 30_000, refetchOnWindowFocus: true },
	);

	const renameBranchMutation = workspaceTrpc.git.renameBranch.useMutation();

	const handleRenameBranch = useCallback(
		(newName: string) => {
			const currentName = status.data?.currentBranch.name;
			if (!currentName) return;
			toast.promise(
				renameBranchMutation.mutateAsync({
					workspaceId,
					oldName: currentName,
					newName,
				}),
				{
					loading: t({
						message: `Renaming branch to ${newName}...`,
					}),
					success: t({
						message: `Branch renamed to ${newName}`,
					}),
					error: (err) =>
						errorMessage(
							err,
							t({
								message: "Failed to rename branch",
							}),
						),
				},
			);
		},
		[workspaceId, status.data?.currentBranch.name, renameBranchMutation, t],
	);

	const canRenameBranch = !status.data?.currentBranch.upstream;

	// The list compares absolute paths — the contract its rows share with the
	// Files tab — while the pane records worktree-relative targets.
	const selectedFilePath =
		selectedDiffTarget && worktreePath
			? toAbsoluteWorkspacePath(worktreePath, selectedDiffTarget.path)
			: undefined;

	// Each path counts once even when it sits in two sections (staged +
	// unstaged). Under the default scope that is the top-bar control's total;
	// a narrower scope (uncommitted, one commit, a range) counts what the tab
	// lists instead.
	const changedPathCount = useMemo(
		() => new Set(files.map((file) => file.path)).size,
		[files],
	);

	const content = (
		<ChangesTabContent
			workspaceId={workspaceId}
			status={status}
			commits={commits}
			branches={branches}
			filter={filter}
			viewMode={viewMode}
			baseBranch={baseBranch}
			files={files}
			isLoading={isLoading}
			worktreePath={worktreePath}
			selectedFilePath={selectedFilePath}
			selectedChangeKey={selectedDiffTarget?.changeKey}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={handleOpenInEditor}
			onFilterChange={setFilter}
			onViewModeChange={setViewMode}
			onBaseBranchChange={setBaseBranch}
			onRenameBranch={handleRenameBranch}
			canRenameBranch={canRenameBranch}
		/>
	);

	return {
		id: "changes",
		label: t({ message: "Changes" }),
		icon: LuGitCompareArrows,
		badge: changedPathCount > 0 ? changedPathCount : undefined,
		content,
	};
}
