import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type React from "react";
import { useState } from "react";
import { trpc } from "renderer/lib/trpc";
import type { Tab } from "renderer/stores/tabs/types";

interface TabContextMenuProps {
	tab: Tab;
	onClose: () => void;
	onRename: () => void;
	children: React.ReactNode;
}

export function TabContextMenu({
	tab,
	onClose,
	onRename,
	children,
}: TabContextMenuProps) {
	const [isTooltipOpen, setIsTooltipOpen] = useState(false);

	// Only fetch worktree info when tooltip is open to avoid N queries on render
	const { data: worktreeInfo } = trpc.workspaces.getWorktreeInfo.useQuery(
		{ workspaceId: tab.workspaceId },
		{ enabled: !!tab.workspaceId && isTooltipOpen },
	);

	const worktreeName = worktreeInfo?.worktreeName;
	const hasCustomAlias = tab.name && !tab.name.match(/^Terminal \d+$/);

	return (
		<Tooltip delayDuration={400} onOpenChange={setIsTooltipOpen}>
			<ContextMenu>
				<TooltipTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</TooltipTrigger>
				<ContextMenuContent className="w-48">
					<ContextMenuItem onSelect={onRename}>Rename Tab</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onSelect={onClose} className="text-destructive">
						Close Tab
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<TooltipContent side="right" showArrow={false} className="max-w-xs">
				<div className="space-y-1">
					{worktreeName && (
						<div className="font-mono text-xs">{worktreeName}</div>
					)}
					{hasCustomAlias && (
						<div className="text-muted-foreground text-xs">
							Alias: {tab.name}
						</div>
					)}
				</div>
			</TooltipContent>
		</Tooltip>
	);
}
