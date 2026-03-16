import { AnimatePresence, motion } from "framer-motion";
import type { DashboardSidebarSection } from "../../../../types";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

interface DashboardSidebarSectionContentProps {
	projectId: string;
	section: DashboardSidebarSection;
	allSections: Array<{ id: string; name: string }>;
	workspaceShortcutLabels: Map<string, string>;
}

export function DashboardSidebarSectionContent({
	projectId,
	section,
	allSections,
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
								accentColor={section.color}
								key={workspace.id}
								id={workspace.id}
								projectId={projectId}
								hostType={workspace.hostType}
								name={workspace.name}
								branch={workspace.branch}
								sections={allSections}
								shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
							/>
						))}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
