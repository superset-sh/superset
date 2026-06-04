import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import { useState } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuEraser,
	LuEyeOff,
} from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useHotkeyDisplay } from "renderer/hotkeys";
import {
	type PaneContextMenuActions,
	PaneContextMenuItems,
} from "../components/PaneContextMenuItems";

function getModifierKeyLabel() {
	const isMac = navigator.platform.toLowerCase().includes("mac");
	return isMac ? "⌘" : "Ctrl+";
}

interface TabContentContextMenuProps {
	children: ReactNode;
	onSplitHorizontal: PaneContextMenuActions["onSplitHorizontal"];
	onSplitVertical: PaneContextMenuActions["onSplitVertical"];
	onSplitWithNewChat?: PaneContextMenuActions["onSplitWithNewChat"];
	onSplitWithNewBrowser?: PaneContextMenuActions["onSplitWithNewBrowser"];
	onEqualizePaneSplits?: PaneContextMenuActions["onEqualizePaneSplits"];
	onClosePane: PaneContextMenuActions["onClosePane"];
	onClearTerminal?: () => void;
	onScrollToBottom?: () => void;
	getSelection?: () => string;
	onPaste?: (text: string) => void;
	onMarkAsUnread?: () => void;
	currentTabId: PaneContextMenuActions["currentTabId"];
	availableTabs: PaneContextMenuActions["availableTabs"];
	onMoveToTab: PaneContextMenuActions["onMoveToTab"];
	onMoveToNewTab: PaneContextMenuActions["onMoveToNewTab"];
	closeLabel?: string;
}

export function TabContentContextMenu({
	children,
	onSplitHorizontal,
	onSplitVertical,
	onSplitWithNewChat,
	onSplitWithNewBrowser,
	onEqualizePaneSplits,
	onClosePane,
	onClearTerminal,
	onScrollToBottom,
	getSelection,
	onPaste,
	onMarkAsUnread,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
	closeLabel = "Close Pane",
}: TabContentContextMenuProps) {
	const clearShortcut = useHotkeyDisplay("CLEAR_TERMINAL").text;
	const showClearShortcut = clearShortcut !== "Unassigned";
	const scrollToBottomShortcut = useHotkeyDisplay("SCROLL_TO_BOTTOM").text;
	const showScrollToBottomShortcut = scrollToBottomShortcut !== "Unassigned";
	const modKey = getModifierKeyLabel();
	const hasTerminalActions = !!onClearTerminal || !!onScrollToBottom;

	const { copyToClipboard } = useCopyToClipboard();
	const [hasSelection, setHasSelection] = useState(false);
	const [hasClipboard, setHasClipboard] = useState(false);

	const handleOpenChange = async (open: boolean) => {
		if (!open) return;
		setHasSelection(!!getSelection?.()?.length);
		try {
			const text = await navigator.clipboard.readText();
			setHasClipboard(!!text);
		} catch {
			setHasClipboard(false);
		}
	};

	const handleCopy = async () => {
		const text = getSelection?.();
		if (!text) return;
		copyToClipboard(text);
	};

	const handlePaste = async () => {
		if (!onPaste) return;
		try {
			const text = await navigator.clipboard.readText();
			if (text) onPaste(text);
		} catch {
			// Clipboard access denied
		}
	};

	return (
		<ContextMenu onOpenChange={handleOpenChange}>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				{getSelection && (
					<ContextMenuItem disabled={!hasSelection} onSelect={handleCopy}>
						<LuClipboardCopy className="size-4" />
						Copy
						<ContextMenuShortcut>{modKey}C</ContextMenuShortcut>
					</ContextMenuItem>
				)}
				{onPaste && (
					<ContextMenuItem disabled={!hasClipboard} onSelect={handlePaste}>
						<LuClipboard className="size-4" />
						Paste
						<ContextMenuShortcut>{modKey}V</ContextMenuShortcut>
					</ContextMenuItem>
				)}
				{(getSelection || onPaste) && <ContextMenuSeparator />}
				{onClearTerminal && (
					<ContextMenuItem onSelect={onClearTerminal}>
						<LuEraser className="size-4" />
						Clear Terminal
						{showClearShortcut && (
							<ContextMenuShortcut>{clearShortcut}</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				)}
				{onScrollToBottom && (
					<ContextMenuItem onSelect={onScrollToBottom}>
						<LuArrowDownToLine className="size-4" />
						Scroll to Bottom
						{showScrollToBottomShortcut && (
							<ContextMenuShortcut>
								{scrollToBottomShortcut}
							</ContextMenuShortcut>
						)}
					</ContextMenuItem>
				)}
				{hasTerminalActions && <ContextMenuSeparator />}
				{onMarkAsUnread && (
					<>
						<ContextMenuItem onSelect={onMarkAsUnread}>
							<LuEyeOff className="size-4" />
							Mark as Unread
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				)}
				<PaneContextMenuItems
					actions={{
						onSplitHorizontal,
						onSplitVertical,
						onSplitWithNewChat,
						onSplitWithNewBrowser,
						onEqualizePaneSplits,
						onClosePane,
						currentTabId,
						availableTabs,
						onMoveToTab,
						onMoveToNewTab,
					}}
					closeLabel={closeLabel}
				/>
			</ContextMenuContent>
		</ContextMenu>
	);
}
