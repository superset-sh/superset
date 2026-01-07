import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import {
	LuClipboard,
	LuClipboardCopy,
	LuColumns2,
	LuFile,
	LuLink,
	LuMousePointerClick,
	LuMoveRight,
	LuPlus,
	LuReplace,
	LuRows2,
	LuScissors,
	LuSearch,
	LuX,
} from "react-icons/lu";
import { trpc } from "renderer/lib/trpc";
import type { Tab } from "renderer/stores/tabs/types";

export interface EditorActions {
	onCut?: () => void;
	onCopy: () => void;
	onPaste?: () => void;
	onSelectAll: () => void;
	onCopyPath?: () => void;
	onCopyPathWithLine?: () => void;
	onFind?: () => void;
	onChangeAllOccurrences?: () => void;
}

export interface PaneActions {
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

interface EditorContextMenuProps {
	children: ReactNode;
	editorActions: EditorActions;
	paneActions: PaneActions;
}

export function EditorContextMenu({
	children,
	editorActions,
	paneActions,
}: EditorContextMenuProps) {
	const targetTabs = paneActions.availableTabs.filter(
		(t) => t.id !== paneActions.currentTabId,
	);

	const { data: platform } = trpc.window.getPlatform.useQuery();
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
		onChangeAllOccurrences,
	} = editorActions;
	const showCutPaste = !!onCut && !!onPaste;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
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

				{/* Editor Actions */}
				{onChangeAllOccurrences && (
					<ContextMenuItem onSelect={onChangeAllOccurrences}>
						<LuReplace className="size-4" />
						Change All Occurrences
						<ContextMenuShortcut>{cmdKey}+Shift+L</ContextMenuShortcut>
					</ContextMenuItem>
				)}

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

				{/* Pane Actions */}
				<ContextMenuItem onSelect={paneActions.onSplitHorizontal}>
					<LuRows2 className="size-4" />
					Split Horizontally
				</ContextMenuItem>
				<ContextMenuItem onSelect={paneActions.onSplitVertical}>
					<LuColumns2 className="size-4" />
					Split Vertically
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuSub>
					<ContextMenuSubTrigger className="gap-2">
						<LuMoveRight className="size-4" />
						Move to Tab
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						{targetTabs.map((tab) => (
							<ContextMenuItem
								key={tab.id}
								onSelect={() => paneActions.onMoveToTab(tab.id)}
							>
								{tab.name}
							</ContextMenuItem>
						))}
						{targetTabs.length > 0 && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={paneActions.onMoveToNewTab}>
							<LuPlus className="size-4" />
							New Tab
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem
					variant="destructive"
					onSelect={paneActions.onClosePane}
				>
					<LuX className="size-4" />
					Close File
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
