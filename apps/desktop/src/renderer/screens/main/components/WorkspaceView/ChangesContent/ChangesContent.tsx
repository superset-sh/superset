import { useParams } from "@tanstack/react-router";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import {
	RightSidebarTab,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { InfiniteScrollView } from "./components/InfiniteScrollView";

export function ChangesContent() {
	const { workspaceId } = useParams({ strict: false });
	const isChangesSidebarVisible = useSidebarStore(
		(s) => s.isSidebarOpen && s.rightSidebarTab === RightSidebarTab.Changes,
	);
	const { data: workspace } = electronTrpc.workspaces.get.useQuery(
		{ id: workspaceId ?? "" },
		{ enabled: !!workspaceId },
	);
	const worktreePath = workspace?.worktreePath;

	const { status, isLoading, effectiveBaseBranch } = useGitChangesStatus({
		worktreePath,
		refetchInterval: isChangesSidebarVisible ? undefined : 2500,
		refetchOnWindowFocus: !isChangesSidebarVisible,
	});

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
