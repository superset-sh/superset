import { AnimatePresence, motion } from "framer-motion";
import type { DashboardSidebarProjectChild } from "../../../../types";
import { DashboardSidebarSection as DashboardSidebarSectionComponent } from "../../../DashboardSidebarSection";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	isCollapsed: boolean;
	projectChildren: DashboardSidebarProjectChild[];
	allSections: Array<{ id: string; name: string }>;
	workspaceShortcutLabels: Map<string, string>;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	isCollapsed,
	projectChildren,
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
						{projectChildren.map((child) =>
							child.type === "workspace" ? (
								<DashboardSidebarWorkspaceItem
									key={child.workspace.id}
									id={child.workspace.id}
									projectId={projectId}
									accentColor={child.workspace.accentColor}
									hostType={child.workspace.hostType}
									name={child.workspace.name}
									branch={child.workspace.branch}
									pullRequest={child.workspace.pullRequest}
									shortcutLabel={workspaceShortcutLabels.get(
										child.workspace.id,
									)}
								/>
							) : (
								<DashboardSidebarSectionComponent
									key={child.section.id}
									projectId={projectId}
									section={child.section}
									allSections={allSections}
									workspaceShortcutLabels={workspaceShortcutLabels}
									onDelete={onDeleteSection}
									onRename={onRenameSection}
									onToggleCollapse={onToggleSectionCollapse}
								/>
							),
						)}
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
