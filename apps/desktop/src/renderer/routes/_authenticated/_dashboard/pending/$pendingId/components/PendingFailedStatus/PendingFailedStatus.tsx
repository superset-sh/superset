import { HiExclamationTriangle } from "react-icons/hi2";

interface PendingFailedStatusProps {
	error: string | null;
	onRetry: () => void;
	onDismiss: () => void;
}

export function PendingFailedStatus({
	error,
	onRetry,
	onDismiss,
}: PendingFailedStatusProps) {
	return (
		<div className="space-y-4">
			<div className="flex items-start gap-2 text-sm text-destructive">
				<HiExclamationTriangle className="size-4 mt-0.5 shrink-0" />
				<span>{error ?? "Failed to create workspace"}</span>
			</div>
			<div className="flex gap-2">
				<button
					type="button"
					className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
					onClick={onRetry}
				>
					Retry
				</button>
				<button
					type="button"
					className="rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
					onClick={onDismiss}
				>
					Dismiss
				</button>
			</div>
		</div>
	);
}
