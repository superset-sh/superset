import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
} from "@superset/ui/context-menu";
import {
	ExternalLink,
	FileText,
	Pencil,
	SquarePlus,
	Trash2,
} from "lucide-react";
import {
	MOD_CLICK_LABEL,
	SHIFT_CLICK_LABEL,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/clickModifierLabels";
import { PathActionsMenuItems } from "../PathActionsMenuItems";

interface FileContextMenuProps {
	absolutePath: string;
	relativePath?: string;
	onOpen: () => void;
	onOpenInNewTab: () => void;
	onOpenInEditor: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FileContextMenu({
	absolutePath,
	relativePath,
	onOpen,
	onOpenInNewTab,
	onOpenInEditor,
	onRename,
	onDelete,
}: FileContextMenuProps) {
	return (
		<ContextMenuContent className="w-56">
			<ContextMenuItem onSelect={onOpen}>
				<FileText />
				Open
			</ContextMenuItem>
			<ContextMenuItem onSelect={onOpenInNewTab}>
				<SquarePlus />
				Open in New Tab
				<ContextMenuShortcut>{SHIFT_CLICK_LABEL}</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuItem onSelect={onOpenInEditor}>
				<ExternalLink />
				Open in Editor
				<ContextMenuShortcut>{MOD_CLICK_LABEL}</ContextMenuShortcut>
			</ContextMenuItem>
			<ContextMenuSeparator />
			<PathActionsMenuItems
				absolutePath={absolutePath}
				relativePath={relativePath}
			/>
			<ContextMenuSeparator />
			<ContextMenuItem onSelect={() => setTimeout(onRename, 0)}>
				<Pencil />
				Rename...
			</ContextMenuItem>
			<ContextMenuItem variant="destructive" onSelect={onDelete}>
				<Trash2 />
				Delete
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
