import { useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { PROJECT_COLOR_DEFAULT } from "shared/constants/project-colors";
import type { DashboardSidebarSection as DashboardSidebarSectionRecord } from "../../types";
import { DashboardSidebarSectionContent } from "./components/DashboardSidebarSectionContent";
import { DashboardSidebarSectionContextMenu } from "./components/DashboardSidebarSectionContextMenu";
import { DashboardSidebarSectionHeader } from "./components/DashboardSidebarSectionHeader";

interface DashboardSidebarSectionProps {
	projectId: string;
	section: DashboardSidebarSectionRecord;
	allSections: Array<{ id: string; name: string }>;
	workspaceShortcutLabels: Map<string, string>;
	onDelete: (sectionId: string) => void;
	onRename: (sectionId: string, name: string) => void;
	onToggleCollapse: (sectionId: string) => void;
}

export function DashboardSidebarSection({
	projectId,
	section,
	allSections,
	workspaceShortcutLabels,
	onDelete,
	onRename,
	onToggleCollapse,
}: DashboardSidebarSectionProps) {
	const { setSectionColor } = useDashboardSidebarState();
	const [isRenaming, setIsRenaming] = useState(false);
	const [renameValue, setRenameValue] = useState(section.name);
	const hasColor =
		section.color != null && section.color !== PROJECT_COLOR_DEFAULT;
	const sectionBorderStyle = {
		borderLeft: hasColor
			? `2px solid ${section.color}`
			: "2px solid var(--color-border)",
	};

	const handleSubmitRename = () => {
		const trimmed = renameValue.trim();
		if (trimmed) {
			onRename(section.id, trimmed);
		}
		setIsRenaming(false);
	};

	const handleCancelRename = () => {
		setRenameValue(section.name);
		setIsRenaming(false);
	};

	return (
		<div className="pb-1" style={sectionBorderStyle}>
			<DashboardSidebarSectionContextMenu
				color={section.color}
				onRename={() => setIsRenaming(true)}
				onSetColor={(color) => setSectionColor(section.id, color)}
				onDelete={() => onDelete(section.id)}
			>
				<DashboardSidebarSectionHeader
					section={section}
					isRenaming={isRenaming}
					renameValue={renameValue}
					onRenameValueChange={setRenameValue}
					onSubmitRename={handleSubmitRename}
					onCancelRename={handleCancelRename}
					onStartRename={() => {
						setRenameValue(section.name);
						setIsRenaming(true);
					}}
					onToggleCollapse={() => onToggleCollapse(section.id)}
				/>
			</DashboardSidebarSectionContextMenu>

			<DashboardSidebarSectionContent
				projectId={projectId}
				section={section}
				allSections={allSections}
				workspaceShortcutLabels={workspaceShortcutLabels}
			/>
		</div>
	);
}
