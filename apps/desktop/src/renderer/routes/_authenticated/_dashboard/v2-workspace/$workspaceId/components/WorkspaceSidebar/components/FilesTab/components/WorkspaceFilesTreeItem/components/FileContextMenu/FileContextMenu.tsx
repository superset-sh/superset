import {
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import { toast } from "@superset/ui/sonner";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface FileContextMenuProps {
	absolutePath: string;
	relativePath?: string;
	onRename: () => void;
	onDelete: () => void;
}

export function FileContextMenu({
	absolutePath,
	relativePath,
	onRename,
	onDelete,
}: FileContextMenuProps) {
	const { copyToClipboard } = useCopyToClipboard();

	return (
		<ContextMenuContent className="w-56">
			<ContextMenuItem>Open to the Side</ContextMenuItem>
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
				onSelect={async () => {
					await copyToClipboard(absolutePath);
					toast.success("Path copied");
				}}
			>
				Copy Path
			</ContextMenuItem>
			{relativePath && (
				<ContextMenuItem
					onSelect={async () => {
						await copyToClipboard(relativePath);
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
