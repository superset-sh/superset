import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";

interface SessionRecoveryNoticeProps {
	isOnline: boolean;
	isRecoveringSession: boolean;
	isRetryPending: boolean;
	onRetry: () => void;
}

export function SessionRecoveryNotice({
	isOnline,
	isRecoveringSession,
	isRetryPending,
	onRetry,
}: SessionRecoveryNoticeProps) {
	return (
		<div className="mb-6 flex w-full max-w-xs flex-col items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-center">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				{isRecoveringSession ? (
					<>
						<Spinner className="size-4" />
						<span>Retrying automatically on focus and every 15s</span>
					</>
				) : (
					<span>
						Session still unavailable. You can retry now or sign in again.
					</span>
				)}
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={onRetry}
				disabled={!isOnline || isRetryPending}
			>
				{isRetryPending ? "Retrying..." : "Retry now"}
			</Button>
		</div>
	);
}
