import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Link } from "@tanstack/react-router";

interface HostConnectionStripProps {
	/** Null for a host with no settings page, like a cloud workspace's box. */
	settingsHostId: string | null;
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

/**
 * Persistent, nonmodal connection status. Docked under the workspace like
 * `AgentCredentialsChangedBanner`, with the explanation always visible
 * instead of behind a click, so a cloud workspace waking up is legible at a
 * glance.
 */
export function HostConnectionStrip({
	settingsHostId,
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
		<div
			aria-live="polite"
			className={cn(
				"flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-2 text-sm text-foreground/85",
				isAccessDenied
					? "border-destructive/40 bg-destructive/10"
					: "border-warning/40 bg-warning/10",
			)}
		>
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
			<span className="shrink-0 font-medium" title={hostName}>
				{label}
			</span>
			<span className="min-w-0 flex-1 select-text text-foreground/70">
				{detail}
			</span>
			{settingsHostId ? (
				<Link
					to="/settings/hosts/$hostId"
					params={{ hostId: settingsHostId }}
					className="shrink-0 font-medium underline underline-offset-4"
				>
					{t({ message: "Host settings" })}
				</Link>
			) : null}
			<button
				type="button"
				onClick={onRetry}
				className="shrink-0 rounded px-1.5 py-0.5 font-medium text-foreground hover:bg-warning/20"
			>
				{t({ message: "Retry" })}
			</button>
		</div>
	);
}
