import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HiChevronRight, HiLink } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useWorkspaceSelectionStore } from "renderer/stores/workspace-selection";
import type { LinkedTarget } from "shared/linked-worktrees-types";
import { skipNextActiveScroll } from "../skip-active-scroll";

export function LinkedWorktreesSection({
	worktreePath,
}: {
	worktreePath: string;
}) {
	const { data: links = [] } =
		electronTrpc.workspaces.getLinkedWorktrees.useQuery({ worktreePath });

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
				<SourceGroup key={sourceDir} sourceDir={sourceDir} items={items} />
			))}
		</div>
	);
}

function SourceGroup({
	sourceDir,
	items,
}: {
	sourceDir: string;
	items: LinkedTarget[];
}) {
	const [open, setOpen] = useState(true);
	const ecosystem = items[0]?.ecosystem ?? "npm";

	return (
		<div>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
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
	const isSelected = useWorkspaceSelectionStore((s) =>
		target.targetWorkspaceId
			? s.selectedIds.has(target.targetWorkspaceId)
			: false,
	);

	const tracked = target.kind === "tracked" && !!target.targetWorkspaceId;

	const handleClick = () => {
		const workspaceId = target.targetWorkspaceId;
		if (!tracked || !workspaceId) return; // untracked/external: no-op in v1
		const store = useWorkspaceSelectionStore;
		store.getState().clearSelection();
		store.getState().toggle(workspaceId, target.targetProjectId ?? "");
		store.setState({ lastClickedId: workspaceId });
		// Open the target worktree without scrolling the sidebar away from here.
		skipNextActiveScroll();
		void navigateToWorkspace(workspaceId, navigate);
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			title={tracked ? undefined : "Linked worktree not imported into superset"}
			className={cn(
				"flex items-center gap-2 w-full pl-3 pr-2 py-1.5 text-sm text-left transition-colors",
				tracked
					? "cursor-pointer hover:bg-muted/50"
					: "cursor-default opacity-70",
				isSelected && "bg-primary/10 ring-1 ring-inset ring-primary/30",
			)}
		>
			<HiLink
				className={cn(
					"size-3.5 shrink-0",
					tracked ? "text-blue-400" : "text-muted-foreground",
				)}
			/>
			<span className="truncate font-mono text-[11px] leading-tight">
				{target.packageName}
				<span className="opacity-50">~</span>
				<span className={cn(tracked && "text-blue-400")}>{target.label}</span>
			</span>
		</button>
	);
}
