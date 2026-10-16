import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";

const ORG_PENDING_TIMEOUT_MS = 15_000;

interface OrgResolutionScreenProps {
	errored: boolean;
	onRetry: () => void;
}

// Shown while the window's org is unresolved. A bare spinner while the
// membership list loads; once the list has failed, or has been in flight long
// enough to look like a hang, say so and offer a retry. Mirrors the blocking
// screens in `_authenticated/layout.tsx`, including the drag strip: main
// windows are frameless, so a screen without one can't be moved.
export function OrgResolutionScreen({
	errored,
	onRetry,
}: OrgResolutionScreenProps) {
	const pendingTimedOut = useDelayElapsed(!errored, ORG_PENDING_TIMEOUT_MS);
	const showRetry = errored || pendingTimedOut;

	return (
		<div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
			<div className="drag absolute inset-x-0 top-0 h-12" />
			<Spinner className="size-8" />
			{showRetry && (
				<>
					<div className="text-center select-text cursor-text">
						<h2 className="text-lg font-medium">
							{errored
								? "Can't reach the Superset server"
								: "Still loading your organizations"}
						</h2>
						<p className="text-sm text-muted-foreground">
							Superset couldn't load your organizations. Check your connection
							and try again.
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={onRetry}>
						Retry
					</Button>
				</>
			)}
		</div>
	);
}
