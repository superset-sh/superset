import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import {
	LuAppWindow,
	LuColumns2,
	LuMoveRight,
	LuPlus,
	LuRows2,
	LuTrash2,
} from "react-icons/lu";
import type { Tab } from "renderer/stores/tabs/types";

export interface FileItemContextMenuActions {
	onOpenInSplitHorizontal: () => void;
	onOpenInSplitVertical: () => void;
	onOpenInApp: () => void;
	onOpenInNewTab: () => void;
	onMoveToTab: (tabId: string) => void;
	onDiscardChanges?: () => void;
}

interface FileItemContextMenuProps {
	children: ReactNode;
	actions: FileItemContextMenuActions;
	currentTabId: string;
	availableTabs: Tab[];
}

export function FileItemContextMenu({
	children,
	actions,
	currentTabId,
	availableTabs,
}: FileItemContextMenuProps) {
	const targetTabs = availableTabs.filter((t) => t.id !== currentTabId);

	return (
		<ContextMenu>
			<ContextMenuContent>
				{/* Open actions */}
				<ContextMenuItem onSelect={actions.onOpenInSplitHorizontal}>
					<LuRows2 className="size-4" />
					Open in Split Pane (Horizontal)
				</ContextMenuItem>
				<ContextMenuItem onSelect={actions.onOpenInSplitVertical}>
					<LuColumns2 className="size-4" />
					Open in Split Pane (Vertical)
				</ContextMenuItem>

				<ContextMenuSeparator />

				<ContextMenuItem onSelect={actions.onOpenInApp}>
					<LuAppWindow className="size-4" />
					Open in App
				</ContextMenuItem>

				<ContextMenuSeparator />

				{/* Tab actions */}
				<ContextMenuSub>
					<ContextMenuSubTrigger className="gap-2">
						<LuMoveRight className="size-4" />
						Open in Tab
					</ContextMenuSubTrigger>
					<ContextMenuSubContent>
						{targetTabs.map((tab) => (
							<ContextMenuItem
								key={tab.id}
								onSelect={() => actions.onMoveToTab(tab.id)}
							>
								{tab.userTitle || tab.name}
							</ContextMenuItem>
						))}
						{targetTabs.length > 0 && <ContextMenuSeparator />}
						<ContextMenuItem onSelect={actions.onOpenInNewTab}>
							<LuPlus className="size-4" />
							New Tab
						</ContextMenuItem>
					</ContextMenuSubContent>
				</ContextMenuSub>

				{/* Destructive actions */}
				{actions.onDiscardChanges && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							variant="destructive"
							onSelect={actions.onDiscardChanges}
						>
							<LuTrash2 className="size-4" />
							Discard Changes
						</ContextMenuItem>
					</>
				)}
			</ContextMenuContent>
			{children}
		</ContextMenu>
	);
}
