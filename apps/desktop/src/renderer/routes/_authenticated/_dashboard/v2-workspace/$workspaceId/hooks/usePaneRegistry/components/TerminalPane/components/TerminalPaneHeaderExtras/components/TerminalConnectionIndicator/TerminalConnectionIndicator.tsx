import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useCallback, useSyncExternalStore } from "react";
import {
	type TerminalLogEntry,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalConnectionIndicatorProps {
	terminalId: string;
	terminalInstanceId: string;
}

function formatTime(timestamp: number): string {
	const d = new Date(timestamp);
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

function formatLogsForClipboard(logs: readonly TerminalLogEntry[]): string {
	return logs
		.map(
			(entry) =>
				`${new Date(entry.timestamp).toISOString()} [${entry.level}] ${entry.message}`,
		)
		.join("\n");
}

/**
 * Pane-header connection status for the terminal WebSocket. Hidden while the
 * connection is healthy; shows an amber "Reconnecting" dot while the
 * auto-reconnect loop runs and a red "Disconnected" dot once the transport
 * stops trying. The popover carries the human diagnosis, a manual reconnect,
 * and the raw transport log for bug reports.
 */
export function TerminalConnectionIndicator({
	terminalId,
	terminalInstanceId,
}: TerminalConnectionIndicatorProps) {
	const subscribe = useCallback(
		(callback: () => void) => {
			const unsubState = terminalRuntimeRegistry.onStateChange(
				terminalId,
				callback,
				terminalInstanceId,
			);
			const unsubLogs = terminalRuntimeRegistry.onLogsChange(
				terminalId,
				callback,
				terminalInstanceId,
			);
			return () => {
				unsubState();
				unsubLogs();
			};
		},
		[terminalId, terminalInstanceId],
	);
	const connectionState = useSyncExternalStore(subscribe, () =>
		terminalRuntimeRegistry.getConnectionState(terminalId, terminalInstanceId),
	);
	const logs = useSyncExternalStore(subscribe, () =>
		terminalRuntimeRegistry.getLogs(terminalId, terminalInstanceId),
	);
	const diagnosis = useSyncExternalStore(subscribe, () =>
		terminalRuntimeRegistry.getConnectionDiagnosis(
			terminalId,
			terminalInstanceId,
		),
	);

	if (connectionState === "open" || connectionState === "disconnected") {
		return null;
	}
	// First connect hasn't had trouble yet — don't flash a status.
	if (connectionState === "connecting" && logs.length === 0 && !diagnosis) {
		return null;
	}

	// Red only once the transport has stopped trying; amber covers both the
	// in-flight dial and the backoff pause between attempts.
	const gaveUp = diagnosis !== null && connectionState === "closed";
	const label = gaveUp ? "Disconnected" : "Reconnecting…";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Terminal connection: ${label}`}
					className="flex h-5 items-center gap-1.5 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					<span
						className={cn(
							"size-1.5 rounded-full",
							gaveUp ? "bg-destructive" : "animate-pulse bg-yellow-500",
						)}
					/>
					<span>{label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-3 text-xs">
				<div className="flex flex-col gap-2">
					<p className="cursor-text select-text text-muted-foreground">
						{diagnosis?.message ??
							"The terminal connection dropped. Retrying automatically…"}
					</p>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant="outline"
							className="h-6 px-2 text-xs"
							onClick={() =>
								terminalRuntimeRegistry.retryConnect(
									terminalId,
									terminalInstanceId,
								)
							}
						>
							Reconnect
						</Button>
						{logs.length > 0 && (
							<button
								type="button"
								onClick={() =>
									navigator.clipboard
										.writeText(formatLogsForClipboard(logs))
										.catch((error) =>
											console.error("[terminal] copy log failed:", error),
										)
								}
								className="text-muted-foreground transition-colors hover:text-foreground"
							>
								Copy log · {logs.length}
							</button>
						)}
					</div>
					{logs.length > 0 && (
						/* column-reverse pins the scroll to the newest entry; the list
						   is reversed so reading order stays chronological. */
						<div className="flex max-h-48 flex-col-reverse overflow-y-auto rounded border border-border bg-muted/30 p-2 font-mono">
							{logs
								.slice()
								.reverse()
								.map((entry) => (
									<div
										key={entry.id}
										className="flex cursor-text select-text gap-2 py-0.5"
									>
										<span className="shrink-0 tabular-nums opacity-60">
											{formatTime(entry.timestamp)}
										</span>
										<span
											className={cn(
												"break-all",
												entry.level === "error" && "text-destructive",
											)}
										>
											{entry.message}
										</span>
									</div>
								))}
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
