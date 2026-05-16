import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard, Copy, FolderOpen } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface PathActionsDropdownMenuItemsProps {
	absolutePath: string;
	relativePath?: string;
}

/**
 * DropdownMenu sibling of `PathActionsMenuItems`. Radix's `DropdownMenu` and
 * `ContextMenu` have separate context scopes, so a `ContextMenuItem` placed
 * inside a `DropdownMenu` (or vice versa) fails the scoped context lookup with
 * "`MenuItem` must be used within `Menu`" — see #4636.
 */
export function PathActionsDropdownMenuItems({
	absolutePath,
	relativePath,
}: PathActionsDropdownMenuItemsProps) {
	const { copyToClipboard } = useCopyToClipboard();

	const handleCopy = (path: string, successMessage: string) => {
		toast.promise(copyToClipboard(path), {
			success: successMessage,
			error: (err: unknown) =>
				`Failed to copy path: ${err instanceof Error ? err.message : "Unknown error"}`,
		});
	};

	const handleRevealInFinder = async () => {
		try {
			await electronTrpcClient.external.openInFinder.mutate(absolutePath);
		} catch (error) {
			toast.error(
				`Failed to reveal in Finder: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	};

	return (
		<>
			<DropdownMenuItem onSelect={handleRevealInFinder}>
				<FolderOpen />
				Reveal in Finder
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				onSelect={() => handleCopy(absolutePath, "Path copied")}
			>
				<Clipboard />
				Copy Path
			</DropdownMenuItem>
			{relativePath && (
				<DropdownMenuItem
					onSelect={() => handleCopy(relativePath, "Relative path copied")}
				>
					<Copy />
					Copy Relative Path
				</DropdownMenuItem>
			)}
		</>
	);
}
