import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import {
	LuColumns2,
	LuGlobe,
	LuMessageSquare,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuX,
} from "react-icons/lu";
import { useHotkeyText } from "renderer/stores/hotkeys";
import type { Tab } from "renderer/stores/tabs/types";

export interface PaneContextMenuActions {
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onSplitWithNewChat?: () => void;
	onSplitWithNewBrowser?: () => void;
	onClosePane: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

interface PaneContextMenuItemsProps {
	actions: PaneContextMenuActions;
	closeLabel: string;
}

export function PaneContextMenuItems({
	actions,
	closeLabel,
}: PaneContextMenuItemsProps) {
	const splitDownShortcut = useHotkeyText("SPLIT_DOWN");
	const splitRightShortcut = useHotkeyText("SPLIT_RIGHT");
	const splitWithChatShortcut = useHotkeyText("SPLIT_WITH_CHAT");
	const splitWithBrowserShortcut = useHotkeyText("SPLIT_WITH_BROWSER");
	const targetTabs = actions.availableTabs.filter(
		(tab) => tab.id !== actions.currentTabId,
	);
	const renderShortcut = (shortcut: string) => {
		if (shortcut === "Unassigned") return null;
		return <ContextMenuShortcut>{shortcut}</ContextMenuShortcut>;
	};

	return (
		<>
			<ContextMenuItem onSelect={actions.onSplitHorizontal}>
				<LuRows2 className="size-4" />
				Split Horizontally
				{renderShortcut(splitDownShortcut)}
			</ContextMenuItem>
			<ContextMenuItem onSelect={actions.onSplitVertical}>
				<LuColumns2 className="size-4" />
				Split Vertically
				{renderShortcut(splitRightShortcut)}
			</ContextMenuItem>
			{actions.onSplitWithNewChat && (
				<ContextMenuItem onSelect={actions.onSplitWithNewChat}>
					<LuMessageSquare className="size-4" />
					Split with New Chat
					{renderShortcut(splitWithChatShortcut)}
				</ContextMenuItem>
			)}
			{actions.onSplitWithNewBrowser && (
				<ContextMenuItem onSelect={actions.onSplitWithNewBrowser}>
					<LuGlobe className="size-4" />
					Split with New Browser
					{renderShortcut(splitWithBrowserShortcut)}
				</ContextMenuItem>
			)}
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
							onSelect={() => actions.onMoveToTab(tab.id)}
						>
							{tab.name}
						</ContextMenuItem>
					))}
					{targetTabs.length > 0 && <ContextMenuSeparator />}
					<ContextMenuItem onSelect={actions.onMoveToNewTab}>
						<LuPlus className="size-4" />
						New Tab
					</ContextMenuItem>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSeparator />
			<ContextMenuItem variant="destructive" onSelect={actions.onClosePane}>
				<LuX className="size-4" />
				{closeLabel}
			</ContextMenuItem>
		</>
	);
}
