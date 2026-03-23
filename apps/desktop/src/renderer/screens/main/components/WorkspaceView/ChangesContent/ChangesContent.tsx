import { useParams } from "@tanstack/react-router";
import { useRef } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWorkspaceFileEvents } from "renderer/screens/main/components/WorkspaceView/hooks/useWorkspaceFileEvents";
import { useGitChangesStatus } from "renderer/screens/main/hooks/useGitChangesStatus";
import {
	RightSidebarTab,
	useSidebarStore,
} from "renderer/stores/sidebar-state";
import { InfiniteScrollView } from "./components/InfiniteScrollView";
import { computeDiffInvalidations } from "./utils/computeDiffInvalidations";

const FILE_EVENT_DEBOUNCE_MS = 75;

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

	const trpcUtils = electronTrpc.useUtils();
	const pendingPathsRef = useRef<Set<string> | "all">(new Set());
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useWorkspaceFileEvents(
		workspaceId ?? "",
		(event) => {
			if (!worktreePath) return;

			const targets = computeDiffInvalidations(event);
			if (targets === "all") {
				pendingPathsRef.current = "all";
			} else if (pendingPathsRef.current !== "all") {
				for (const p of targets) {
					pendingPathsRef.current.add(p);
				}
			}

			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}

			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				const pending = pendingPathsRef.current;
				pendingPathsRef.current = new Set();

				const invalidations: Promise<unknown>[] = [];

				if (pending === "all") {
					invalidations.push(
						trpcUtils.changes.getGitFileContents.invalidate(),
						trpcUtils.changes.getGitOriginalContent.invalidate(),
					);
					if (workspaceId) {
						invalidations.push(trpcUtils.filesystem.readFile.invalidate());
					}
				} else {
					for (const absolutePath of pending) {
						invalidations.push(
							trpcUtils.changes.getGitFileContents.invalidate({
								worktreePath,
								absolutePath,
							}),
							trpcUtils.changes.getGitOriginalContent.invalidate({
								worktreePath,
								absolutePath,
							}),
						);
						if (workspaceId) {
							invalidations.push(
								trpcUtils.filesystem.readFile.invalidate({
									workspaceId,
									absolutePath,
								}),
							);
						}
					}
				}

				Promise.all(invalidations).catch((error) => {
					console.error("[ChangesContent] Failed to invalidate diff queries:", {
						worktreePath,
						error,
					});
				});
			}, FILE_EVENT_DEBOUNCE_MS);
		},
		Boolean(workspaceId && worktreePath),
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
