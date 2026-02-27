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
import { useState } from "react";
import {
	LuArrowDownToLine,
	LuClipboard,
	LuClipboardCopy,
	LuColumns2,
	LuEraser,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuX,
} from "react-icons/lu";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { Tab } from "renderer/stores/tabs/types";

function getModifierKeyLabel() {
	const isMac = navigator.platform.toLowerCase().includes("mac");
	return isMac ? "⌘" : "Ctrl+";
}

interface TabContentContextMenuProps {
	children: ReactNode;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
	onClearTerminal?: () => void;
	onScrollToBottom?: () => void;
	getSelection?: () => string;
	onPaste?: (text: string) => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
	closeLabel?: string;
}

export function TabContentContextMenu({
	children,
	onSplitHorizontal,
	onSplitVertical,
	onClosePane,
	onClearTerminal,
	onScrollToBottom,
	getSelection,
	onPaste,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
	closeLabel = "Close Pane",
}: TabContentContextMenuProps) {
	// Filter out current tab from available targets
	const targetTabs = availableTabs.filter((t) => t.id !== currentTabId);
	const clearShortcut = useHotkeyText("CLEAR_TERMINAL");
	const showClearShortcut = clearShortcut !== "Unassigned";
	const scrollToBottomShortcut = useHotkeyText("SCROLL_TO_BOTTOM");
	const showScrollToBottomShortcut = scrollToBottomShortcut !== "Unassigned";
	const modKey = getModifierKeyLabel();
	const hasTerminalActions = !!onClearTerminal || !!onScrollToBottom;

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
		await navigator.clipboard.writeText(text);
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
				<ContextMenuItem onSelect={onSplitHorizontal}>
					<LuRows2 className="size-4" />
					Split Horizontally
				</ContextMenuItem>
				<ContextMenuItem onSelect={onSplitVertical}>
					<LuColumns2 className="size-4" />
					Split Vertically
				</ContextMenuItem>
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
				<ContextMenuSub>
					<ContextMenuSubTrigger className="gap-2">
						<LuMoveRight className="size-4" />
						Move to Tab
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						{targetTabs.map((tab) => (
							<ContextMenuItem
								key={tab.id}
								onSelect={() => onMoveToTab(tab.id)}
							>
								{tab.name}
							</ContextMenuItem>
						))}
						{targetTabs.length > 0 && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={onMoveToNewTab}>
							<LuPlus className="size-4" />
							New Tab
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				<ContextMenuSeparator />
				<ContextMenuItem variant="destructive" onSelect={onClosePane}>
					<LuX className="size-4" />
					{closeLabel}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
