import { AnimatePresence, motion } from "framer-motion";
import type { DashboardSidebarSection } from "../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

interface DashboardSidebarSectionContentProps {
	projectId: string;
	section: DashboardSidebarSection;
	workspaceShortcutLabels: Map<string, string>;
}

export function DashboardSidebarSectionContent({
	projectId,
	section,
	workspaceShortcutLabels,
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
								accentColor={workspace.accentColor}
								key={workspace.id}
								id={workspace.id}
								projectId={projectId}
								hostType={workspace.hostType}
								name={workspace.name}
								branch={workspace.branch}
								pullRequest={workspace.pullRequest}
								shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
							/>
						))}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
