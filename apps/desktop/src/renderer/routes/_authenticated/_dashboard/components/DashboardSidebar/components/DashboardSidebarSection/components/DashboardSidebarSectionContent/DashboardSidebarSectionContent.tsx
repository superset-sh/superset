import { AnimatePresence, motion } from "framer-motion";
import type { DashboardSidebarSection } from "../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

interface DashboardSidebarSectionContentProps {
	section: DashboardSidebarSection;
	workspaceShortcutLabels: Map<string, string>;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

export function DashboardSidebarSectionContent({
	section,
	workspaceShortcutLabels,
	onWorkspaceHover,
}: DashboardSidebarSectionContentProps) {
	return (
		<AnimatePresence initial={false}>
			{!section.isCollapsed && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="overflow-hidden"
				>
					<div>
						{section.workspaces.map((workspace) => (
							<DashboardSidebarWorkspaceItem
								key={workspace.id}
								workspace={workspace}
								onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
								shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
							/>
						))}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
