import { cn } from "@superset/ui/utils";
import { AnimatePresence, motion } from "framer-motion";
import { HiChevronRight } from "react-icons/hi2";
import { LuFolder } from "react-icons/lu";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import type { LinkedTarget } from "shared/linked-worktrees-types";
import { LinkedRow } from "./LinkedRow";

export function SourceGroup({
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
