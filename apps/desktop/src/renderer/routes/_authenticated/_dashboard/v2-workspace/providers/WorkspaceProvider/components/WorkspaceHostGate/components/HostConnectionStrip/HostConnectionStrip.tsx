import { useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";

interface HostConnectionStripProps {
	hostId: string;
	hostName: string;
	detail: string;
	isAccessDenied: boolean;
	/** The socket is retrying, including time spent in its native backoff. */
	isReconnecting: boolean;
	/** The socket has opened before, so this is a drop rather than a first dial. */
	hasConnected: boolean;
	/** The coordinator is restarting the local host service right now. */
	isLocalRestartInFlight: boolean;
	onRetry: () => void;
}

/** Persistent, nonmodal connection status. Recovery advice opens only on request. */
export function HostConnectionStrip({
	hostId,
	hostName,
	detail,
	isAccessDenied,
	isReconnecting,
	hasConnected,
	isLocalRestartInFlight,
	onRetry,
}: HostConnectionStripProps) {
	const { t } = useLingui();
	const isDialing =
		!isAccessDenied && (isReconnecting || isLocalRestartInFlight);
	const label = isAccessDenied
		? t({ message: "Access denied" })
		: isLocalRestartInFlight
			? t({ message: "Restarting…" })
			: !isReconnecting
				? t({ message: "Disconnected" })
				: hasConnected
					? t({ message: "Reconnecting…" })
					: t({ message: "Connecting…" });

	return (
		<div className="pointer-events-none absolute inset-x-0 top-2 z-40 flex justify-center px-2">
			<div className="pointer-events-auto flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border/60 bg-background/95 py-1.5 pl-3 pr-1.5 text-[12px] text-muted-foreground shadow-sm backdrop-blur-sm">
				<span
					aria-hidden="true"
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						isAccessDenied
							? "bg-destructive"
							: isDialing
								? "animate-pulse bg-yellow-500"
								: "bg-muted-foreground/40",
					)}
				/>
				<span aria-live="polite" className="min-w-0 truncate" title={hostName}>
					{label}
				</span>
				<Popover>
					<PopoverTrigger asChild>
						<button
							type="button"
							className="shrink-0 rounded-full px-1.5 py-0.5 font-medium text-foreground hover:bg-muted/60"
						>
							{t({ message: "Details" })}
						</button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={8}
						aria-label={t({ message: "Details" })}
						className="w-80 max-w-[calc(100vw-2rem)] space-y-2 text-[13px]"
					>
						<p className="break-words font-medium">{hostName}</p>
						<p className="select-text leading-relaxed text-muted-foreground">
							{detail}
						</p>
						<Link
							to="/settings/hosts/$hostId"
							params={{ hostId }}
							className="inline-block font-medium underline underline-offset-4"
						>
							{t({ message: "Host settings" })}
						</Link>
					</PopoverContent>
				</Popover>
				<button
					type="button"
					onClick={onRetry}
					className="shrink-0 rounded-full px-1.5 py-0.5 font-medium text-foreground hover:bg-muted/60"
				>
					{t({ message: "Retry" })}
				</button>
			</div>
		</div>
	);
}
