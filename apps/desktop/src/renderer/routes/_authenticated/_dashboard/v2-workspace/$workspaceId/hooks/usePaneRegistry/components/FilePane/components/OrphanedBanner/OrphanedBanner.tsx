import { Trans } from "@lingui/react/macro";

interface OrphanedBannerProps {
	dirty: boolean;
	onDiscard?: () => void;
}

export function OrphanedBanner({ dirty, onDiscard }: OrphanedBannerProps) {
	return (
		<div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground">
			<span>
				{dirty ? (
					<Trans id="workspace.filePane.deletedOnDiskDirty">
						File was deleted on disk. You still have unsaved changes.
					</Trans>
				) : (
					<Trans id="workspace.filePane.deletedOnDisk">
						File was deleted on disk.
					</Trans>
				)}
			</span>
			{dirty && onDiscard && (
				<button
					type="button"
					className="underline hover:no-underline"
					onClick={onDiscard}
				>
					<Trans id="workspace.filePane.discardOrphaned">Discard</Trans>
				</button>
			)}
		</div>
	);
}
