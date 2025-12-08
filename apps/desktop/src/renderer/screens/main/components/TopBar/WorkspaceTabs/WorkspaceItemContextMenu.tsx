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
}

export function WorkspaceItemContextMenu({
	children,
	workspaceId,
	worktreePath,
	workspaceAlias,
	onRename,
}: WorkspaceItemContextMenuProps) {
	const openInFinder = trpc.external.openInFinder.useMutation();

	const handleOpenInFinder = () => {
		if (worktreePath) {
			openInFinder.mutate(worktreePath);
		}
	};

	return (
		<HoverCard openDelay={400} closeDelay={100}>
			<ContextMenu>
				<HoverCardTrigger asChild>
					<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
				</HoverCardTrigger>
				<ContextMenuContent>
					<ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
					<ContextMenuSeparator />
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
