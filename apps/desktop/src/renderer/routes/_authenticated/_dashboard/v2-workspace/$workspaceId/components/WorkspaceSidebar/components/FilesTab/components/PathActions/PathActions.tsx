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
						message: "Unknown error",
					}),
				);
				return t({
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
					message: "Unknown error",
				}),
			);
			toast.error(
				t({
					message: `Failed to reveal in Finder: ${reason}`,
				}),
			);
		}
	};
	return (
		<>
			<DropdownMenuItem onSelect={handleRevealInFinder}>
				<FolderOpen />
				<Trans>Reveal in Finder</Trans>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem
				onSelect={() =>
					handleCopy(
						absolutePath,
						t({
							message: "Path copied",
						}),
					)
				}
			>
				<Clipboard />
				<Trans>Copy Path</Trans>
			</DropdownMenuItem>
			{relativePath && (
				<DropdownMenuItem
					onSelect={() =>
						handleCopy(
							relativePath,
							t({
								message: "Relative path copied",
							}),
						)
					}
				>
					<Copy />
					<Trans>Copy Relative Path</Trans>
				</DropdownMenuItem>
			)}
		</>
	);
}
