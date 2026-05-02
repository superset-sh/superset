import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@superset/ui/dropdown-menu";
import {
	MOD_CLICK_LABEL,
	SHIFT_CLICK_LABEL,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/clickModifierLabels";
import { PathActions } from "../PathActions";

interface FileMenuItemsProps {
	absolutePath: string;
	relativePath: string;
	onOpen: () => void;
	onOpenInNewTab: () => void;
	onOpenInEditor: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FileMenuItems({
	absolutePath,
	relativePath,
	onOpen,
	onOpenInNewTab,
	onOpenInEditor,
	onRename,
	onDelete,
}: FileMenuItemsProps) {
	return (
		<>
			<DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInNewTab}>
				Open in New Tab
				<DropdownMenuShortcut>{SHIFT_CLICK_LABEL}</DropdownMenuShortcut>
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInEditor}>
				Open in Editor
				<DropdownMenuShortcut>{MOD_CLICK_LABEL}</DropdownMenuShortcut>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<PathActions absolutePath={absolutePath} relativePath={relativePath} />
			<DropdownMenuSeparator />
			<DropdownMenuItem onSelect={() => setTimeout(onRename, 0)}>
				Rename...
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onSelect={onDelete}>
				Delete
			</DropdownMenuItem>
		</>
	);
}
