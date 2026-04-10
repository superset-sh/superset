import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useMemo } from "react";
import type { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import type { SidebarTabDefinition } from "../../types";
import { ChangesTabContent } from "./components/ChangesTabContent";

export type { ChangesFilter };

interface UseChangesTabParams {
	workspaceId: string;
	gitStatus: ReturnType<typeof useGitStatus>;
	onSelectFile?: (
		path: string,
		category: "against-base" | "staged" | "unstaged",
	) => void;
}

export function useChangesTab({
	workspaceId,
	gitStatus: status,
	onSelectFile,
}: UseChangesTabParams): SidebarTabDefinition {
	const collections = useCollections();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const filter: ChangesFilter = localState?.sidebarState?.changesFilter ?? {
		kind: "all",
	};
	const baseBranch: string | null =
		localState?.sidebarState?.baseBranch ?? null;

	const setFilter = useCallback(
		(next: ChangesFilter) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesFilter = next;
			});
		},
		[collections, workspaceId],
	);

	const setBaseBranch = useCallback(
		(branchName: string) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.baseBranch = branchName;
			});
		},
		[collections, workspaceId],
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
					loading: `Renaming branch to ${newName}...`,
					success: `Branch renamed to ${newName}`,
					error: (err) =>
						err instanceof Error ? err.message : "Failed to rename branch",
				},
			);
		},
		[workspaceId, status.data?.currentBranch.name, renameBranchMutation],
	);

	const canRenameBranch = !status.data?.currentBranch.upstream;

	const commitFilesInput =
		filter.kind === "commit"
			? { workspaceId, commitHash: filter.hash }
			: filter.kind === "range"
				? { workspaceId, commitHash: filter.toHash, fromHash: filter.fromHash }
				: { workspaceId, commitHash: "" };

	const commitFiles = workspaceTrpc.git.getCommitFiles.useQuery(
		commitFilesInput,
		{ enabled: filter.kind === "commit" || filter.kind === "range" },
	);

	const filteredFiles = useMemo(() => {
		if (!status.data) return [];
		if (filter.kind === "uncommitted") {
			return [...status.data.staged, ...status.data.unstaged];
		}
		if (filter.kind === "commit" || filter.kind === "range") {
			return commitFiles.data?.files ?? [];
		}
		const map = new Map<string, (typeof status.data.againstBase)[number]>();
		for (const f of status.data.againstBase) map.set(f.path, f);
		for (const f of status.data.staged) map.set(f.path, f);
		for (const f of status.data.unstaged) map.set(f.path, f);
		return Array.from(map.values());
	}, [status.data, filter.kind, commitFiles.data?.files]);

	const totalChanges = filteredFiles.length;
	const totalAdditions = filteredFiles.reduce((sum, f) => sum + f.additions, 0);
	const totalDeletions = filteredFiles.reduce((sum, f) => sum + f.deletions, 0);

	const fileCategory: "against-base" | "staged" | "unstaged" =
		filter.kind === "uncommitted" ? "unstaged" : "against-base";

	const content = (
		<ChangesTabContent
			status={status}
			commits={commits}
			branches={branches}
			commitFiles={commitFiles}
			filter={filter}
			filteredFiles={filteredFiles}
			fileCategory={fileCategory}
			totalChanges={totalChanges}
			totalAdditions={totalAdditions}
			totalDeletions={totalDeletions}
			onSelectFile={onSelectFile}
			onFilterChange={setFilter}
			onBaseBranchChange={setBaseBranch}
			onRenameBranch={handleRenameBranch}
			canRenameBranch={canRenameBranch}
		/>
	);

	return {
		id: "changes",
		label: "Changes",
		badge: totalChanges > 0 ? totalChanges : undefined,
		content,
	};
}
