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
	const workspaceIds = section.workspaces.map((workspace) => workspace.id);

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
					<div className="pb-1">
						{section.workspaces.map((workspace, index) => (
							<DashboardSidebarWorkspaceItem
								key={workspace.id}
								id={workspace.id}
								projectId={projectId}
								sectionId={section.id}
								name={workspace.name}
								branch={workspace.branch}
								index={index}
								workspaceIds={workspaceIds}
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
