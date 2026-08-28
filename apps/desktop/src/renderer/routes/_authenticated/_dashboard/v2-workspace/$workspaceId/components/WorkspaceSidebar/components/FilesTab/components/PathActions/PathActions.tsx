import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@superset/ui/dropdown-menu";
import { toast } from "@superset/ui/sonner";
import { Clipboard, Copy, FolderOpen } from "lucide-react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { electronTrpcClient } from "renderer/lib/trpc-client";

interface PathActionsProps {
	absolutePath: string;
	relativePath: string;
}

export function PathActions({ absolutePath, relativePath }: PathActionsProps) {
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
	return (
		<>
			<DropdownMenuItem onSelect={handleRevealInFinder}>
				<FolderOpen />
				<Trans id="workspace.pathActions.revealInFinder">
					Reveal in Finder
				</Trans>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				onSelect={() => handleCopy(absolutePath, "Path copied")}
			>
				<Clipboard />
				<Trans id="workspace.pathActions.copyPath">Copy Path</Trans>
			</DropdownMenuItem>
			{relativePath && (
				<DropdownMenuItem
					onSelect={() => handleCopy(relativePath, "Relative path copied")}
				>
					<Copy />
					<Trans id="workspace.pathActions.copyRelativePath">
						Copy Relative Path
					</Trans>
				</DropdownMenuItem>
			)}
		</>
	);
}
