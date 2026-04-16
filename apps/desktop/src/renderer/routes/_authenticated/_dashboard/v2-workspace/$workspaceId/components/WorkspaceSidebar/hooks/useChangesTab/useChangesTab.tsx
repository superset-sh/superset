import { toast } from "@superset/ui/sonner";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback } from "react";
import type { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { useChangeset } from "../../../../hooks/useChangeset";
import { useSidebarDiffRef } from "../../../../hooks/useSidebarDiffRef";
import type { SidebarTabDefinition } from "../../types";
import { ChangesTabContent } from "./components/ChangesTabContent";

export type { ChangesFilter };

interface UseChangesTabParams {
	workspaceId: string;
	gitStatus: ReturnType<typeof useGitStatus>;
	onSelectFile?: (path: string) => void;
}

export function useChangesTab({
	workspaceId,
	gitStatus: status,
	onSelectFile,
}: UseChangesTabParams): SidebarTabDefinition {
	const collections = useCollections();
	const utils = workspaceTrpc.useUtils();
	const localState = collections.v2WorkspaceLocalState.get(workspaceId);
	const filter: ChangesFilter = localState?.sidebarState?.changesFilter ?? {
		kind: "all",
	};

	const baseBranchQuery = workspaceTrpc.git.getBaseBranch.useQuery(
		{ workspaceId },
		{ staleTime: Number.POSITIVE_INFINITY },
	);
	const baseBranch = baseBranchQuery.data?.baseBranch ?? null;

	const ref = useSidebarDiffRef(workspaceId);
	const { files, isLoading } = useChangeset({ workspaceId, ref });

	const setFilter = useCallback(
		(next: ChangesFilter) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) return;
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.changesFilter = next;
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
	});

	const setBaseBranch = useCallback(
		(branchName: string) => {
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

	const totalChanges = files.length;
	const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
	const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

	const content = (
		<ChangesTabContent
			status={status}
			commits={commits}
			branches={branches}
			filter={filter}
			baseBranch={baseBranch}
			files={files}
			isLoading={isLoading}
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
