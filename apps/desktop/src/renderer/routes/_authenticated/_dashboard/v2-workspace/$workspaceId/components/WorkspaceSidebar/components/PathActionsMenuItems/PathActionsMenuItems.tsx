import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	ContextMenuItem,
	ContextMenuSeparator,
} from "@superset/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard, Copy, FolderOpen } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface PathActionsMenuItemsProps {
	absolutePath: string;
	relativePath?: string;
	menuType?: "context" | "dropdown";
}

export function PathActionsMenuItems({
	absolutePath,
	relativePath,
	menuType = "context",
}: PathActionsMenuItemsProps) {
	const { copyToClipboard } = useCopyToClipboard();

	const handleCopy = (path: string, successMessage: string) => {
		toast.promise(copyToClipboard(path), {
			success: successMessage,
			error: (err: unknown) =>
				`Failed to copy path: ${errorMessage(err, "Unknown error")}`,
		});
	};

	const handleRevealInFinder = async () => {
		try {
			await electronTrpcClient.external.openInFinder.mutate(absolutePath);
		} catch (error) {
			toast.error(
				`Failed to reveal in Finder: ${errorMessage(error, "Unknown error")}`,
			);
		}
	};

	if (menuType === "dropdown") {
		return (
			<>
				<DropdownMenuItem onSelect={handleRevealInFinder}>
					<FolderOpen />
					<Trans id="workspace.pathActionsMenuItems.dropdownRevealInFinder">
						Reveal in Finder
					</Trans>
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => handleCopy(absolutePath, "Path copied")}
				>
					<Clipboard />
					<Trans id="workspace.pathActionsMenuItems.dropdownCopyPath">
						Copy Path
					</Trans>
				</DropdownMenuItem>
				{relativePath && (
					<DropdownMenuItem
						onSelect={() => handleCopy(relativePath, "Relative path copied")}
					>
						<Copy />
						<Trans id="workspace.pathActionsMenuItems.dropdownCopyRelativePath">
							Copy Relative Path
						</Trans>
					</DropdownMenuItem>
				)}
			</>
		);
	}

	return (
		<>
			<ContextMenuItem onSelect={handleRevealInFinder}>
				<FolderOpen />
				<Trans id="workspace.pathActionsMenuItems.contextRevealInFinder">
					Reveal in Finder
				</Trans>
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onSelect={() => handleCopy(absolutePath, "Path copied")}>
				<Clipboard />
				<Trans id="workspace.pathActionsMenuItems.contextCopyPath">
					Copy Path
				</Trans>
			</ContextMenuItem>
			{relativePath && (
				<ContextMenuItem
					onSelect={() => handleCopy(relativePath, "Relative path copied")}
				>
					<Copy />
					<Trans id="workspace.pathActionsMenuItems.contextCopyRelativePath">
						Copy Relative Path
					</Trans>
				</ContextMenuItem>
			)}
		</>
	);
}
