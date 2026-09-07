import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

interface HostConnectionStripProps {
	hostName: string;
	/** A dial is in flight (the socket's own backoff or a forced redial). */
	isReconnecting: boolean;
	/** The socket has opened before, so this is a drop rather than a first dial. */
	hasConnected: boolean;
	/** The coordinator is restarting the local host service right now. */
	isLocalRestartInFlight: boolean;
	onRetry: () => void;
}

/**
 * Non-blocking notice for a host that has been down for a few seconds. Panes
 * stay visible and usable underneath while the socket redials; escalating to
 * the full takeover is WorkspaceHostGate's call.
 */
export function HostConnectionStrip({
	hostName,
	isReconnecting,
	hasConnected,
	isLocalRestartInFlight,
	onRetry,
}: HostConnectionStripProps) {
	const { t } = useLingui();
	const isDialing = isReconnecting || isLocalRestartInFlight;
	const label = isLocalRestartInFlight
		? t({ message: "Restarting…" })
		: !isReconnecting
			? t({ message: "Disconnected" })
			: hasConnected
				? t({ message: "Reconnecting…" })
				: t({ message: "Connecting…" });

	return (
		<div
			aria-live="polite"
			className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center"
		>
			<div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/60 bg-background/95 py-1.5 pl-3 pr-1.5 text-[12px] text-muted-foreground shadow-sm backdrop-blur-sm">
				<span
					aria-hidden="true"
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						isDialing
							? "animate-pulse bg-yellow-500"
							: "bg-muted-foreground/40",
					)}
				/>
				<span className="min-w-0 truncate" title={hostName}>
					{label}
				</span>
				<button
					type="button"
					onClick={onRetry}
					className="rounded-full px-1.5 py-0.5 font-medium text-foreground hover:bg-muted/60"
				>
					{t({ message: "Retry" })}
				</button>
			</div>
		</div>
	);
}
