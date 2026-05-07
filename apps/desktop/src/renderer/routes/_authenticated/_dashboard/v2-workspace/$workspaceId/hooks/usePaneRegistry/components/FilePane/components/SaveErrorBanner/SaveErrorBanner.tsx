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
				Save failed: {message}
			</span>
			{onRetry && (
				<button
					type="button"
					className="underline hover:no-underline"
					onClick={onRetry}
				>
					Retry
				</button>
			)}
			{onDismiss && (
				<button
					type="button"
					className="underline hover:no-underline"
					onClick={onDismiss}
				>
					Dismiss
				</button>
			)}
		</div>
	);
}
