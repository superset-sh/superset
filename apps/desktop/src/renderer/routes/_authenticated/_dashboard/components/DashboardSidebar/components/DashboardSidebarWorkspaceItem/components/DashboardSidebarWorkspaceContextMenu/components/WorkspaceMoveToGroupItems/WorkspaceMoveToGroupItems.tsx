import { Trans } from "@lingui/react/macro";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { LuFolderPlus } from "react-icons/lu";
import { useProjectTagFolderSections } from "../../../../../../hooks/useProjectTagFolderSections";

interface WorkspaceMoveToGroupItemsProps {
	projectId: string | null;
	onMoveToSection: (sectionId: string) => void;
	onCreateSection: () => void;
}

/**
 * The "Move to group" list. It lives in its own component so the folder
 * derivation runs only while the submenu is open: every sidebar row mounts a
 * context menu, and deriving all folders in each one re-did that work on
 * every workspace change.
 */
export function WorkspaceMoveToGroupItems({
	projectId,
	onMoveToSection,
	onCreateSection,
}: WorkspaceMoveToGroupItemsProps) {
	// The derived union — a tag-only folder with no stored row is a valid
	// move target.
	const { sections } = useProjectTagFolderSections(projectId);
	return (
		<>
			{sections.map((section) => (
				<ContextMenuItem
					key={section.id}
					onSelect={() => onMoveToSection(section.id)}
				>
					{section.color && (
						<span
							className="size-2 shrink-0 rounded-full mr-2"
							style={{ backgroundColor: section.color }}
						/>
					)}
					{section.name}
				</ContextMenuItem>
			))}
			{sections.length > 0 && <ContextMenuSeparator />}
			<ContextMenuItem onSelect={onCreateSection}>
				<LuFolderPlus className="size-4 mr-2" />
				<Trans>Create new group</Trans>
			</ContextMenuItem>
		</>
	);
}
