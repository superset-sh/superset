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
