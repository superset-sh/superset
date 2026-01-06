import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import type { ReactNode } from "react";
import { trpc } from "renderer/lib/trpc";
import { WorkspaceHoverCardContent } from "./WorkspaceHoverCard";

interface WorkspaceItemContextMenuProps {
	children: ReactNode;
	workspaceId: string;
	worktreePath: string;
	workspaceAlias?: string;
	onRename: () => void;
	canRename?: boolean;
	showHoverCard?: boolean;
}

export function WorkspaceItemContextMenu({
	children,
	workspaceId,
	worktreePath,
	workspaceAlias,
	onRename,
	canRename = true,
	showHoverCard = true,
}: WorkspaceItemContextMenuProps) {
	const openInFinder = trpc.external.openInFinder.useMutation();

	const handleOpenInFinder = () => {
		if (worktreePath) {
			openInFinder.mutate(worktreePath);
		}
	};

	// For branch workspaces, just show context menu without hover card
	if (!showHoverCard) {
		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				<ContextMenuContent>
					{canRename && (
						<>
							<ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
							<ContextMenuSeparator />
						</>
					)}
					<ContextMenuItem onSelect={handleOpenInFinder}>
						Open in Finder
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	}

	return (
		<HoverCard openDelay={400} closeDelay={100}>
			<ContextMenu>
				<HoverCardTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</HoverCardTrigger>
				<ContextMenuContent>
					{canRename && (
						<>
							<ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
							<ContextMenuSeparator />
						</>
					)}
					<ContextMenuItem onSelect={handleOpenInFinder}>
						Open in Finder
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
			<HoverCardContent side="bottom" align="start" className="w-72">
				<WorkspaceHoverCardContent
					workspaceId={workspaceId}
					workspaceAlias={workspaceAlias}
				/>
			</HoverCardContent>
		</HoverCard>
	);
}
