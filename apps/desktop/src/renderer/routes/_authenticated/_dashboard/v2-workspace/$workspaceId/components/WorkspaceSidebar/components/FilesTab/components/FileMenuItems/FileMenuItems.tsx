import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
} from "@superset/ui/dropdown-menu";
import {
	ExternalLink,
	FileText,
	Pencil,
	SquarePlus,
	Trash2,
} from "lucide-react";
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
			<DropdownMenuItem onSelect={onOpen}>
				<FileText />
				Open
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInNewTab}>
				<SquarePlus />
				Open in New Tab
				{newTabTier && (
					<DropdownMenuShortcut>
						{modifierLabel(newTabTier)}
					</DropdownMenuShortcut>
				)}
			</DropdownMenuItem>
			<DropdownMenuItem onSelect={onOpenInEditor}>
				<ExternalLink />
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
				<Pencil />
				Rename...
			</DropdownMenuItem>
			<DropdownMenuItem variant="destructive" onSelect={onDelete}>
				<Trash2 />
				Delete
			</DropdownMenuItem>
		</>
	);
}
