import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Columns2, MoveRight, Plus, Rows2, X } from "lucide-react";
import type { ReactNode } from "react";
import type { Tab } from "renderer/stores/tabs/types";

interface TabContentContextMenuProps {
	children: ReactNode;
	onSplitHorizontal: () => void;
	onSplitVertical: () => void;
	onClosePane?: () => void;
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
					<Rows2 className="size-4" />
					Split Horizontally
				</ContextMenuItem>
				<ContextMenuItem onSelect={onSplitVertical}>
					<Columns2 className="size-4" />
					Split Vertically
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuSub>
					<ContextMenuSubTrigger className="gap-2">
						<MoveRight className="size-4" />
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
							<Plus className="size-4" />
							New Tab
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>
				{onClosePane && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem variant="destructive" onSelect={onClosePane}>
							<X className="size-4" />
							Close Pane
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
		</ContextMenu>
	);
}
