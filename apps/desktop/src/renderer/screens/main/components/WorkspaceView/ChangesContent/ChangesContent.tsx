import { useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useChangesStore } from "renderer/stores/changes";
import { InfiniteScrollView } from "./components/InfiniteScrollView";

export function ChangesContent() {
	const { workspaceId } = useParams({ strict: false });
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const { getBaseBranch } = useChangesStore();
	const baseBranch = getBaseBranch(worktreePath || "");
	const { data: branchData } = electronTrpc.changes.getBranches.useQuery(
		{ worktreePath: worktreePath || "" },
		{ enabled: !!worktreePath },
	);

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? "main";

	const { data: status, isLoading } = electronTrpc.changes.getStatus.useQuery(
		{ worktreePath: worktreePath || "", defaultBranch: effectiveBaseBranch },
		{
			enabled: !!worktreePath,
			refetchInterval: 2500,
			refetchOnWindowFocus: true,
		},
	);

	if (!worktreePath) {
		return (
			<div className="h-full flex items-center justify-center text-muted-foreground">
				No workspace selected
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="h-full flex items-center justify-center text-muted-foreground">
				Loading changes...
			</div>
		);
	}

	if (!status) {
		return (
			<div className="h-full flex items-center justify-center text-muted-foreground">
				Unable to load changes
			</div>
		);
	}

	return (
		<div className="h-full overflow-hidden">
			<InfiniteScrollView
				status={status}
				worktreePath={worktreePath}
				baseBranch={effectiveBaseBranch}
			/>
		</div>
	);
}
