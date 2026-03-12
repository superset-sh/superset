import { AnimatePresence, motion } from "framer-motion";
import { HiChevronRight } from "react-icons/hi2";
import type { V2SidebarWorkspace } from "../../types";
import { V2WorkspaceListItem } from "../V2WorkspaceListItem";

interface V2ProjectSectionProps {
	projectId: string;
	projectName: string;
	isCollapsed: boolean;
	workspaces: V2SidebarWorkspace[];
	onToggleCollapse: (projectId: string) => void;
}

export function V2ProjectSection({
	projectId,
	projectName,
	isCollapsed,
	workspaces,
	onToggleCollapse,
}: V2ProjectSectionProps) {
	return (
		<div className="space-y-0.5">
			<button
				type="button"
				onClick={() => onToggleCollapse(projectId)}
				className="flex w-full items-center gap-1 rounded-md px-2 py-1 text-left text-[11px] font-medium tracking-wider text-muted-foreground uppercase hover:bg-muted/50"
			>
				<HiChevronRight
					className={`size-3 shrink-0 transition-transform duration-150 ${
						isCollapsed ? "" : "rotate-90"
					}`}
				/>
				<span className="truncate">{projectName}</span>
				<span className="ml-auto text-[10px] tabular-nums opacity-60">
					{workspaces.length}
				</span>
			</button>

			<AnimatePresence initial={false}>
				{!isCollapsed && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.15, ease: "easeOut" }}
						className="overflow-hidden"
					>
						<div className="space-y-0.5">
							{workspaces.map((workspace) => (
								<V2WorkspaceListItem
									key={workspace.id}
									id={workspace.id}
									name={workspace.name}
									branch={workspace.branch}
									deviceId={workspace.deviceId}
								/>
							))}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}
