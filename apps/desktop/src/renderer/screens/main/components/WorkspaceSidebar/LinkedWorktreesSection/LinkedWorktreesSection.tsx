import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { HiChevronRight, HiLink } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import type { LinkedTarget } from "shared/linked-worktrees-types";
import { skipNextActiveScroll } from "../skip-active-scroll";

export function LinkedWorktreesSection({
	workspaceId,
	links,
}: {
	workspaceId: string;
	links: LinkedTarget[];
}) {
	if (links.length === 0) return null;

	const groups = new Map<string, LinkedTarget[]>();
	for (const link of links) {
		const arr = groups.get(link.sourceDir) ?? [];
		arr.push(link);
		groups.set(link.sourceDir, arr);
	}

	return (
		<div className="flex flex-col">
			{[...groups.entries()].map(([sourceDir, items]) => (
				<SourceGroup
					key={sourceDir}
					workspaceId={workspaceId}
					sourceDir={sourceDir}
					items={items}
				/>
			))}
		</div>
	);
}

function SourceGroup({
	workspaceId,
	sourceDir,
	items,
}: {
	workspaceId: string;
	sourceDir: string;
	items: LinkedTarget[];
}) {
	// Folder open/closed is persisted per (worktree, sourceDir); defaults open.
	const open = useWorkspaceSidebarStore(
		(s) => !s.isLinkSourceCollapsed(workspaceId, sourceDir),
	);
	const toggleLinkSourceCollapsed = useWorkspaceSidebarStore(
		(s) => s.toggleLinkSourceCollapsed,
	);
	const ecosystem = items[0]?.ecosystem ?? "npm";

	return (
		<div>
			<button
				type="button"
				onClick={() => toggleLinkSourceCollapsed(workspaceId, sourceDir)}
				className={cn(
					"flex items-center gap-1.5 w-full pl-2 pr-2 py-1.5 text-[11px] font-medium uppercase tracking-wider",
					"text-muted-foreground hover:bg-muted/50 transition-colors text-left cursor-pointer",
				)}
			>
				<HiChevronRight
					className={cn(
						"size-3 shrink-0 transition-transform duration-150",
						open && "rotate-90",
					)}
				/>
				<LuFolder className="size-3 shrink-0" />
				<span className="truncate font-mono text-[10px] normal-case tracking-normal">
					{sourceDir}
				</span>
				<span className="ml-auto shrink-0 text-[10px] tabular-nums font-normal normal-case tracking-normal text-muted-foreground/70">
					{ecosystem} {items.length}
				</span>
			</button>

			<AnimatePresence initial={false}>
				{open && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="pl-2">
							{items.map((item) => (
								<LinkedRow
									key={`${item.sourceDir}/${item.packageName}`}
									target={item}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function LinkedRow({ target }: { target: LinkedTarget }) {
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
