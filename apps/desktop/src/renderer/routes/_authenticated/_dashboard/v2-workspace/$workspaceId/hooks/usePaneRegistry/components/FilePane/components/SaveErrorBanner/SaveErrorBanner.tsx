import { Trans } from "@lingui/react/macro";

interface SaveErrorBannerProps {
	message: string;
	onRetry?: () => void;
	onDismiss?: () => void;
}

export function SaveErrorBanner({
	message,
	onRetry,
	onDismiss,
}: SaveErrorBannerProps) {
	return (
		<div className="flex items-center gap-2 border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive-foreground">
			<span className="flex-1 truncate select-text cursor-text">
				<Trans id="workspace.filePane.saveFailed">Save failed: {message}</Trans>
			</span>
			{onRetry && (
				<button
					type="button"
					className="underline hover:no-underline"
					onClick={onRetry}
				>
					<Trans id="workspace.filePane.retrySave">Retry</Trans>
				</button>
			)}
			{onDismiss && (
				<button
					type="button"
					className="underline hover:no-underline"
					onClick={onDismiss}
				>
					<Trans id="workspace.filePane.dismissSaveError">Dismiss</Trans>
				</button>
			)}
		</div>
	);
}
