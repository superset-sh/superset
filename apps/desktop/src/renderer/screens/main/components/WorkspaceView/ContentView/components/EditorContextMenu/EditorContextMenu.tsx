import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import {
	LuClipboard,
	LuClipboardCopy,
	LuFile,
	LuLink,
	LuMousePointerClick,
	LuScissors,
	LuSearch,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type PaneContextMenuActions,
	PaneContextMenuItems,
} from "../PaneContextMenuItems";

export interface EditorActions {
	onCut?: () => void;
	onCopy: () => void;
	onPaste?: () => void;
	onSelectAll: () => void;
	onCopyPath?: () => void;
	onCopyPathWithLine?: () => void;
	onFind?: () => void;
}

export type PaneActions = PaneContextMenuActions;

interface EditorContextMenuProps {
	children: ReactNode;
	editorActions: EditorActions;
	paneActions: PaneActions;
	leadingItems?: ReactNode;
}

export function EditorContextMenu({
	children,
	editorActions,
	paneActions,
	leadingItems,
}: EditorContextMenuProps) {
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const cmdKey = isMac ? "Cmd" : "Ctrl";

	const {
		onCut,
		onCopy,
		onPaste,
		onSelectAll,
		onCopyPath,
		onCopyPathWithLine,
		onFind,
	} = editorActions;
	const showCutPaste = !!onCut && !!onPaste;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				{leadingItems && (
					<>
						{leadingItems}
						<ContextMenuSeparator />
					</>
				)}

				{/* Clipboard Actions */}
				{showCutPaste && (
					<ContextMenuItem onSelect={onCut}>
						<LuScissors className="size-4" />
						Cut
						<ContextMenuShortcut>{cmdKey}+X</ContextMenuShortcut>
					</ContextMenuItem>
				)}
				<ContextMenuItem onSelect={onCopy}>
					<LuClipboardCopy className="size-4" />
					Copy
					<ContextMenuShortcut>{cmdKey}+C</ContextMenuShortcut>
				</ContextMenuItem>
				{onCopyPath && (
					<ContextMenuItem onSelect={onCopyPath}>
						<LuFile className="size-4" />
						Copy Path
					</ContextMenuItem>
				)}
				{onCopyPathWithLine && (
					<ContextMenuItem onSelect={onCopyPathWithLine}>
						<LuLink className="size-4" />
						Copy Path:Line
						<ContextMenuShortcut>{cmdKey}+Shift+C</ContextMenuShortcut>
					</ContextMenuItem>
				)}
				{showCutPaste && (
					<ContextMenuItem onSelect={onPaste}>
						<LuClipboard className="size-4" />
						Paste
						<ContextMenuShortcut>{cmdKey}+V</ContextMenuShortcut>
					</ContextMenuItem>
				)}

				<ContextMenuSeparator />

				<ContextMenuItem onSelect={onSelectAll}>
					<LuMousePointerClick className="size-4" />
					Select All
					<ContextMenuShortcut>{cmdKey}+A</ContextMenuShortcut>
				</ContextMenuItem>

				{onFind && (
					<ContextMenuItem onSelect={onFind}>
						<LuSearch className="size-4" />
						Find
						<ContextMenuShortcut>{cmdKey}+F</ContextMenuShortcut>
					</ContextMenuItem>
				)}

				<ContextMenuSeparator />

				<PaneContextMenuItems actions={paneActions} closeLabel="Close File" />
			</ContextMenuContent>
		</ContextMenu>
	);
}
