import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();
	const handleCopy = (path: string, successMessage: string) => {
		toast.promise(copyToClipboard(path), {
			success: successMessage,
			error: (err: unknown) => {
				const reason = errorMessage(
					err,
					t({
						id: "workspace.pathActions.unknownError",
						message: "Unknown error",
					}),
				);
				return t({
					id: "workspace.pathActions.copyPathFailed",
					message: `Failed to copy path: ${reason}`,
				});
			},
		});
	};
	const handleRevealInFinder = async () => {
		try {
			await electronTrpcClient.external.openInFinder.mutate(absolutePath);
		} catch (error) {
			const reason = errorMessage(
				error,
				t({
					id: "workspace.pathActions.unknownError",
					message: "Unknown error",
				}),
			);
			toast.error(
				t({
					id: "workspace.pathActions.revealInFinderFailed",
					message: `Failed to reveal in Finder: ${reason}`,
				}),
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
				onSelect={() =>
					handleCopy(
						absolutePath,
						t({
							id: "workspace.pathActions.pathCopied",
							message: "Path copied",
						}),
					)
				}
			>
				<Clipboard />
				<Trans id="workspace.pathActions.copyPath">Copy Path</Trans>
			</DropdownMenuItem>
			{relativePath && (
				<DropdownMenuItem
					onSelect={() =>
						handleCopy(
							relativePath,
							t({
								id: "workspace.pathActions.relativePathCopied",
								message: "Relative path copied",
							}),
						)
					}
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
