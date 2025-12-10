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
	LuColumns2,
	LuEraser,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuX,
} from "react-icons/lu";
import type { Tab } from "renderer/stores/tabs/types";

interface TabContentContextMenuProps {
	children: ReactNode;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane: () => void;
	onClearTerminal: () => void;
	currentTabId: string;
	availableTabs: Tab[];
	onMoveToTab: (tabId: string) => void;
	onMoveToNewTab: () => void;
}

export function TabContentContextMenu({
	children,
	onSplitHorizontal,
	onSplitVertical,
	onClosePane,
	onClearTerminal,
	currentTabId,
	availableTabs,
	onMoveToTab,
	onMoveToNewTab,
}: TabContentContextMenuProps) {
	// Filter out current tab from available targets
	const targetTabs = availableTabs.filter((t) => t.id !== currentTabId);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onSplitHorizontal}>
					<LuRows2 className="size-4" />
					Split Horizontally
				</ContextMenuItem>
				<ContextMenuItem onSelect={onSplitVertical}>
					<LuColumns2 className="size-4" />
					Split Vertically
				</ContextMenuItem>
				<ContextMenuItem onSelect={onClearTerminal}>
					<LuEraser className="size-4" />
					Clear Terminal
					<ContextMenuShortcut>⌘K</ContextMenuShortcut>
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
					Close Terminal
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
