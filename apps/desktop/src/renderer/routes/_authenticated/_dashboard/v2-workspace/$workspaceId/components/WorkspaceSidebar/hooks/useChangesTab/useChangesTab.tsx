import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import type { useGitStatus } from "renderer/hooks/host-service/useGitStatus";
import { useChangeset } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { useOpenInExternalEditor } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useOpenInExternalEditor";
import { useSidebarDiffRef } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useSidebarDiffRef";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { ChangesFilter } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import { toAbsoluteWorkspacePath } from "shared/absolute-paths";
import type { SidebarTabDefinition } from "../../types";
import { ChangesTabContent } from "./components/ChangesTabContent";

export type { ChangesFilter };

interface UseChangesTabParams {
	workspaceId: string;
	gitStatus: ReturnType<typeof useGitStatus>;
	onSelectFile?: (path: string, openInNewTab?: boolean) => void;
	onOpenFile?: (absolutePath: string, openInNewTab?: boolean) => void;
}

export function useChangesTab({
	workspaceId,
	gitStatus: status,
	onSelectFile,
	onOpenFile,
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

	const [isRefreshing, setIsRefreshing] = useState(false);
	const handleRefresh = useCallback(async () => {
		if (isRefreshing) return;
		setIsRefreshing(true);
		try {
			await Promise.all([
				utils.git.getStatus.invalidate({ workspaceId }),
				utils.git.getDiff.invalidate({ workspaceId }),
				utils.git.listCommits.invalidate({ workspaceId }),
				utils.git.listBranches.invalidate({ workspaceId }),
				utils.git.getBaseBranch.invalidate({ workspaceId }),
			]);
		} catch (error) {
			console.warn("Failed to refresh changes tab", error);
			toast.error(
				error instanceof Error ? error.message : "Failed to refresh changes",
			);
		} finally {
			setIsRefreshing(false);
		}
	}, [utils, workspaceId, isRefreshing]);

	const actions = (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="size-6"
					onClick={() => void handleRefresh()}
					disabled={isRefreshing}
				>
					<RefreshCw
						className={cn("size-3.5", isRefreshing && "animate-spin")}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="bottom">Refresh changes</TooltipContent>
		</Tooltip>
	);

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
			worktreePath={worktreePath}
			onSelectFile={onSelectFile}
			onOpenFile={onOpenFile}
			onOpenInEditor={handleOpenInEditor}
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
		actions,
		content,
	};
}
