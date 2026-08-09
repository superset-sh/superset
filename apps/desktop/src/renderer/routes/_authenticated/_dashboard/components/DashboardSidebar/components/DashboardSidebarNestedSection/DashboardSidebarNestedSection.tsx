import { useCallback, useEffect, useState } from "react";
import { useDashboardSidebarSectionRename } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarSectionRenameContext";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type { DashboardSidebarSection } from "../../types";
import {
	DashboardSidebarSectionActionsDropdown,
	DashboardSidebarSectionContextMenu,
} from "../DashboardSidebarSection/components/DashboardSidebarSectionContextMenu";
import { DashboardSidebarSectionHeader } from "../DashboardSidebarSection/components/DashboardSidebarSectionHeader";
import { DashboardSidebarWorkspaceItem } from "../DashboardSidebarWorkspaceItem";

export interface NestedSectionSelection {
	isWorkspaceSelected: (workspaceId: string) => boolean;
	/** Returns true when the event was consumed as a selection gesture. */
	onWorkspaceSelectionClick: (
		event: Parameters<
			NonNullable<
				React.ComponentProps<
					typeof DashboardSidebarWorkspaceItem
				>["onSelectionClick"]
			>
		>[0],
		workspaceId: string,
	) => boolean;
}

interface DashboardSidebarNestedSectionProps {
	section: DashboardSidebarSection;
	/** 0 = a root group in the Sessions area; ≥1 = nested inside a group. */
	depth: number;
	workspaceShortcutLabels?: Map<string, string>;
	/** Bulk-selection wiring (project scope only). */
	selection?: NestedSectionSelection;
	onWorkspaceHover: (workspaceId: string) => void | Promise<void>;
}

/**
 * Recursive group renderer for the parts of the tree the flat DnD lane does
 * not manage: groups nested inside a group, and the Sessions area's root
 * groups. Children render folders-first (nested groups above the group's own
 * workspaces); moves in and out happen through the context menus.
 */
export function DashboardSidebarNestedSection({
	section,
	depth,
	workspaceShortcutLabels,
	selection,
	onWorkspaceHover,
}: DashboardSidebarNestedSectionProps) {
	const {
		deleteSection,
		renameSection,
		setSectionColor,
		toggleSectionCollapsed,
	} = useDashboardSidebarState();
	const { clearPendingSectionRename, pendingRenameSectionId } =
		useDashboardSidebarSectionRename();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(section.name);

	const startRename = useCallback(() => {
		setRenameValue(section.name);
		setIsRenaming(true);
	}, [section.name]);

	useEffect(() => {
		if (pendingRenameSectionId !== section.id) return;
		startRename();
		clearPendingSectionRename(section.id);
	}, [
		clearPendingSectionRename,
		pendingRenameSectionId,
		section.id,
		startRename,
	]);

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed) renameSection(section.id, trimmed);
		setIsRenaming(false);
	};

	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;

	return (
		<div style={{ paddingLeft: depth > 0 ? 10 : 0 }}>
			<div
				style={{
					borderLeft: hasColor
						? `2px solid ${section.color}`
						: "2px solid var(--color-border)",
				}}
			>
				<DashboardSidebarSectionContextMenu
					color={section.color}
					sectionId={section.id}
					onRename={startRename}
					onSetColor={(color) => setSectionColor(section.id, color)}
					onDelete={() => deleteSection(section.id)}
				>
					<DashboardSidebarSectionHeader
						section={section}
						isRenaming={isRenaming}
						renameValue={renameValue}
						onRenameValueChange={setRenameValue}
						onSubmitRename={handleSubmitRename}
						onCancelRename={() => {
							setRenameValue(section.name);
							setIsRenaming(false);
						}}
						onToggleCollapse={() => toggleSectionCollapsed(section.id)}
						actions={
							<DashboardSidebarSectionActionsDropdown
								color={section.color}
								sectionId={section.id}
								onRename={startRename}
								onSetColor={(color) => setSectionColor(section.id, color)}
								onDelete={() => deleteSection(section.id)}
							/>
						}
					/>
				</DashboardSidebarSectionContextMenu>
			</div>
			{!section.isCollapsed && (
				<>
					{section.childSections.map((child) => (
						<DashboardSidebarNestedSection
							key={child.id}
							section={child}
							depth={depth + 1}
							workspaceShortcutLabels={workspaceShortcutLabels}
							selection={selection}
							onWorkspaceHover={onWorkspaceHover}
						/>
					))}
					<div style={{ paddingLeft: depth > 0 ? 10 : 0 }}>
						{section.workspaces.map((workspace) => {
							const canBulkSelect =
								selection !== undefined &&
								workspace.type === "worktree" &&
								workspace.pendingTransaction?.type !== "insert";
							return (
								<DashboardSidebarWorkspaceItem
									key={workspace.id}
									workspace={workspace}
									isInSection
									shortcutLabel={workspaceShortcutLabels?.get(workspace.id)}
									isSelected={
										canBulkSelect && selection.isWorkspaceSelected(workspace.id)
									}
									onSelectionClick={
										canBulkSelect
											? (event) =>
													selection.onWorkspaceSelectionClick(
														event,
														workspace.id,
													)
											: undefined
									}
									onHoverCardOpen={() => onWorkspaceHover(workspace.id)}
								/>
							);
						})}
					</div>
				</>
			)}
		</div>
	);
}
