import { AnimatePresence, motion } from "framer-motion";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../../../types";
import { DashboardSidebarSection as DashboardSidebarSectionComponent } from "../../../DashboardSidebarSection";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	workspaces: DashboardSidebarWorkspace[];
	sections: DashboardSidebarSection[];
	allSections: Array<{ id: string; name: string }>;
	workspaceShortcutLabels: Map<string, string>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	isCollapsed,
	workspaces,
	sections,
	allSections,
	workspaceShortcutLabels,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	return (
		<AnimatePresence initial={false}>
			{!isCollapsed && (
				<motion.div
					initial={{ height: 0, opacity: 0 }}
					animate={{ height: "auto", opacity: 1 }}
					exit={{ height: 0, opacity: 0 }}
					transition={{ duration: 0.15, ease: "easeOut" }}
					className="overflow-hidden"
				>
					<div className="pb-1">
						{workspaces.map((workspace) => (
							<DashboardSidebarWorkspaceItem
								key={workspace.id}
								id={workspace.id}
								projectId={projectId}
								accentColor={null}
								hostType={workspace.hostType}
								name={workspace.name}
								branch={workspace.branch}
								sections={allSections}
								shortcutLabel={workspaceShortcutLabels.get(workspace.id)}
							/>
						))}
						{sections.map((section) => (
							<DashboardSidebarSectionComponent
								key={section.id}
								projectId={projectId}
								section={section}
								allSections={allSections}
								workspaceShortcutLabels={workspaceShortcutLabels}
								onDelete={onDeleteSection}
								onRename={onRenameSection}
								onToggleCollapse={onToggleSectionCollapse}
							/>
						))}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
