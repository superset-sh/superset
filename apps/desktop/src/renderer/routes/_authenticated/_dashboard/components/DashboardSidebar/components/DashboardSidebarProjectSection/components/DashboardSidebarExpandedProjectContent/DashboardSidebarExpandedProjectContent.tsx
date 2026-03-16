import { AnimatePresence, motion } from "framer-motion";
import type {
	DashboardSidebarSection,
	DashboardSidebarWorkspace,
} from "../../../../types";
import { DashboardSidebarSection as DashboardSidebarSectionComponent } from "../../../DashboardSidebarSection";
import { DashboardSidebarWorkspaceItem } from "../../../DashboardSidebarWorkspaceItem";
import { DashboardSidebarProjectRow } from "../DashboardSidebarProjectRow";

interface DashboardSidebarExpandedProjectContentProps {
	projectId: string;
	projectName: string;
	githubOwner: string | null;
	isCollapsed: boolean;
	workspaces: DashboardSidebarWorkspace[];
	sections: DashboardSidebarSection[];
	topLevelWorkspaceIds: string[];
	allSections: Array<{ id: string; name: string }>;
	workspaceShortcutLabels: Map<string, string>;
	totalWorkspaceCount: number;
	isRenaming: boolean;
	renameValue: string;
	onRenameValueChange: (value: string) => void;
	onSubmitRename: () => void;
	onCancelRename: () => void;
	onStartRename: () => void;
	onToggleCollapse: () => void;
	onNewWorkspace: () => void;
	onDeleteSection: (sectionId: string) => void;
	onRenameSection: (sectionId: string, name: string) => void;
	onToggleSectionCollapse: (sectionId: string) => void;
}

export function DashboardSidebarExpandedProjectContent({
	projectId,
	projectName,
	githubOwner,
	isCollapsed,
	workspaces,
	sections,
	topLevelWorkspaceIds,
	allSections,
	workspaceShortcutLabels,
	totalWorkspaceCount,
	isRenaming,
	renameValue,
	onRenameValueChange,
	onSubmitRename,
	onCancelRename,
	onStartRename,
	onToggleCollapse,
	onNewWorkspace,
	onDeleteSection,
	onRenameSection,
	onToggleSectionCollapse,
}: DashboardSidebarExpandedProjectContentProps) {
	return (
		<>
			<DashboardSidebarProjectRow
				projectName={projectName}
				githubOwner={githubOwner}
				totalWorkspaceCount={totalWorkspaceCount}
				isCollapsed={isCollapsed}
				isRenaming={isRenaming}
				renameValue={renameValue}
				onRenameValueChange={onRenameValueChange}
				onSubmitRename={onSubmitRename}
				onCancelRename={onCancelRename}
				onStartRename={onStartRename}
				onToggleCollapse={onToggleCollapse}
				onNewWorkspace={onNewWorkspace}
			/>

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
							{workspaces.map((workspace, index) => (
								<DashboardSidebarWorkspaceItem
									key={workspace.id}
									id={workspace.id}
									projectId={projectId}
									name={workspace.name}
									branch={workspace.branch}
									index={index}
									workspaceIds={topLevelWorkspaceIds}
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
		</>
	);
}
