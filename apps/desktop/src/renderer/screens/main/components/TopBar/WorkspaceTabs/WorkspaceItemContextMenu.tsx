import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@superset/ui/context-menu";
import type { ReactNode } from "react";
import { trpc } from "renderer/lib/trpc";

interface WorkspaceItemContextMenuProps {
	children: ReactNode;
	worktreePath: string;
	onRename: () => void;
}

export function WorkspaceItemContextMenu({
	children,
	worktreePath,
	onRename,
}: WorkspaceItemContextMenuProps) {
	const openInFinder = trpc.external.openInFinder.useMutation();

	const handleOpenInFinder = () => {
		if (worktreePath) {
			openInFinder.mutate(worktreePath);
		}
	};

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onSelect={handleOpenInFinder}>
					Open in Finder
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
