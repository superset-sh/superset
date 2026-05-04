import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@superset/ui/dropdown-menu";
import { modifierLabel, useSidebarFilePolicy } from "renderer/lib/clickPolicy";
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
	const { tierForAction } = useSidebarFilePolicy();
	const newTabTier = tierForAction("newTab");
	const externalTier = tierForAction("external");
	return (
		<>
			<DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInNewTab}>
				Open in New Tab
				{newTabTier && (
					<DropdownMenuShortcut>
						{modifierLabel(newTabTier)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInEditor}>
				Open in Editor
				{externalTier && (
					<DropdownMenuShortcut>
						{modifierLabel(externalTier)}
					</DropdownMenuShortcut>
				)}
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
