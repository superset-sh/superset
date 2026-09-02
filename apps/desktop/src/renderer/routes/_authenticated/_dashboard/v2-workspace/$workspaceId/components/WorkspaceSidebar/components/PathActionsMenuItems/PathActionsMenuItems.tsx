import { Trans, useLingui } from "@lingui/react/macro";
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
	const { t } = useLingui();
	const { copyToClipboard } = useCopyToClipboard();

	const handleCopy = (path: string, successMessage: string) => {
		toast.promise(copyToClipboard(path), {
			success: successMessage,
			error: (err: unknown) => {
				const reason = errorMessage(
					err,
					t({
						id: "workspace.pathActionsMenuItems.unknownError",
						message: "Unknown error",
					}),
				);
				return t({
					id: "workspace.pathActionsMenuItems.copyPathFailed",
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
					id: "workspace.pathActionsMenuItems.unknownError",
					message: "Unknown error",
				}),
			);
			toast.error(
				t({
					id: "workspace.pathActionsMenuItems.revealInFinderFailed",
					message: `Failed to reveal in Finder: ${reason}`,
				}),
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
					onSelect={() =>
						handleCopy(
							absolutePath,
							t({
								id: "workspace.pathActionsMenuItems.pathCopied",
								message: "Path copied",
							}),
						)
					}
				>
					<Clipboard />
					<Trans id="workspace.pathActionsMenuItems.dropdownCopyPath">
						Copy Path
					</Trans>
				</DropdownMenuItem>
				{relativePath && (
					<DropdownMenuItem
						onSelect={() =>
							handleCopy(
								relativePath,
								t({
									id: "workspace.pathActionsMenuItems.relativePathCopied",
									message: "Relative path copied",
								}),
							)
						}
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
			<ContextMenuItem
				onSelect={() =>
					handleCopy(
						absolutePath,
						t({
							id: "workspace.pathActionsMenuItems.pathCopied",
							message: "Path copied",
						}),
					)
				}
			>
				<Clipboard />
				<Trans id="workspace.pathActionsMenuItems.contextCopyPath">
					Copy Path
				</Trans>
			</ContextMenuItem>
			{relativePath && (
				<ContextMenuItem
					onSelect={() =>
						handleCopy(
							relativePath,
							t({
								id: "workspace.pathActionsMenuItems.relativePathCopied",
								message: "Relative path copied",
							}),
						)
					}
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
