import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface FolderContextMenuProps {
	absolutePath: string;
	relativePath?: string;
	onNewFile: () => void;
	onNewFolder: () => void;
	onRename: () => void;
	onDelete: () => void;
}

export function FolderContextMenu({
	absolutePath,
	relativePath,
	onNewFile,
	onNewFolder,
	onRename,
	onDelete,
}: FolderContextMenuProps) {
	return (
		<ContextMenuContent className="w-56">
			<ContextMenuItem onSelect={() => setTimeout(onNewFile, 0)}>
				New File...
			</ContextMenuItem>
			<ContextMenuItem onSelect={() => setTimeout(onNewFolder, 0)}>
				New Folder...
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem
				onSelect={() =>
					electronTrpcClient.external.openInFinder.mutate(absolutePath)
				}
			>
				Reveal in Finder
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem
				onSelect={() => {
					navigator.clipboard.writeText(absolutePath);
					toast.success("Path copied");
				}}
			>
				Copy Path
			</ContextMenuItem>
			{relativePath && (
				<ContextMenuItem
					onSelect={() => {
						navigator.clipboard.writeText(relativePath);
						toast.success("Relative path copied");
					}}
				>
					Copy Relative Path
				</ContextMenuItem>
			)}
			<ContextMenuSeparator />
			<ContextMenuItem onSelect={() => setTimeout(onRename, 0)}>
				Rename...
			</ContextMenuItem>
			<ContextMenuItem variant="destructive" onSelect={onDelete}>
				Delete
			</ContextMenuItem>
		</ContextMenuContent>
	);
}
