import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { HiLink } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import type { LinkedTarget } from "shared/linked-worktrees-types";
import { skipNextActiveScroll } from "../../../skip-active-scroll";

export function LinkedRow({ target }: { target: LinkedTarget }) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const openLinked = electronTrpc.workspaces.openLinkedWorktree.useMutation();
	const isSelected = useWorkspaceSelectionStore((s) =>
		target.targetWorkspaceId
			? s.selectedIds.has(target.targetWorkspaceId)
			: false,
	);

	// `external` (non-git) cannot be opened; tracked + untracked can.
	const openable = target.kind === "tracked" || target.kind === "untracked";

	const navigateToTarget = (workspaceId: string, projectId: string) => {
		const store = useWorkspaceSelectionStore;
		store.getState().clearSelection();
		store.getState().toggle(workspaceId, projectId);
		store.setState({ lastClickedId: workspaceId });
		// Open the target worktree without scrolling the sidebar away from here.
		skipNextActiveScroll(workspaceId);
		void navigateToWorkspace(workspaceId, navigate);
	};

	const handleClick = () => {
		if (!openable) return;

		// Already tracked: navigate straight to the existing workspace.
		if (target.kind === "tracked") {
			const workspaceId = target.targetWorkspaceId;
			const projectId = target.targetProjectId;
			// A tracked target without a projectId is incomplete — bail rather than
			// seed the selection store with "".
			if (!workspaceId || !projectId) return;
			navigateToTarget(workspaceId, projectId);
			return;
		}

		// Untracked: import the parent project (hidden) + worktree, then navigate.
		// Failure is a silent no-op (matches prior untracked behavior).
		openLinked.mutate(
			{ targetPath: target.targetPath },
			{
				onSuccess: ({ workspaceId, projectId }) => {
					navigateToTarget(workspaceId, projectId);
					// Reclassify this row (untracked -> tracked) and refresh selection.
					// Broad invalidate (no worktreePath arg) on purpose: the row that
					// reclassifies untracked -> tracked lives in a sibling worktree's
					// section, whose path this row doesn't know.
					void utils.workspaces.getLinkedWorktrees.invalidate();
				},
				onError: (error) => {
					// Silent for the user (per spec); breadcrumb for debugging only.
					console.warn(
						`[LinkedWorktrees] Failed to open ${target.targetPath}:`,
						error,
					);
				},
			},
		);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={openLinked.isPending}
			title={
				openable ? undefined : "Linked worktree not imported into superset"
			}
			className={cn(
				"flex items-center gap-2 w-full pl-3 pr-2 py-1.5 text-sm text-left transition-colors",
				openable
					? "cursor-pointer hover:bg-muted/50"
					: "cursor-default opacity-70",
				isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
			)}
		>
			<HiLink
				className={cn(
					"size-3.5 shrink-0",
					openable ? "text-blue-400" : "text-muted-foreground",
				)}
			/>
			<span className="truncate font-mono text-[11px] leading-tight">
				{target.packageName}
				<span className="opacity-50">~</span>
				<span className={cn(openable && "text-blue-400")}>{target.label}</span>
			</span>
		</button>
	);
}
