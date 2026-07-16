import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import { workspaceTrpc } from "@superset/workspace-client";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
	type TerminalLogEntry,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";

interface TerminalConnectionIndicatorProps {
	terminalId: string;
	terminalInstanceId: string;
}

/** How often to re-ask the host whether the daemon is answering. */
const DAEMON_HEALTH_POLL_MS = 5_000;
/**
 * How long the daemon must stay silent before we tell the user. The only fix
 * we can offer closes every shell, so a stall has to look permanent before we
 * suggest it — a post-update load spike resolves itself well inside this, and
 * the shells come back on their own.
 */
const DAEMON_UNREACHABLE_WARN_MS = 10_000;

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
 * Pane-header health for the terminal, across both things that can break it.
 *
 * The WebSocket: hidden while healthy, amber "Reconnecting" while the
 * auto-reconnect loop runs, red "Disconnected" once the transport gives up.
 * The popover carries the diagnosis, a manual reconnect, and the raw log.
 *
 * The pty-daemon: red "Terminals aren't responding" when the host reports it
 * has stopped answering for {@link DAEMON_UNREACHABLE_WARN_MS}. That outranks
 * the WebSocket's story because the daemon owns the shells — and it's shown
 * even when the socket looks fine, since a wedged daemon closes nothing and
 * simply freezes the shell. The only fix closes every terminal, so it sits
 * behind a confirm and we wait out short stalls rather than offer it.
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
	const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);

	const connectionHealthy =
		connectionState === "open" || connectionState === "disconnected";
	// Polled even while this pane looks fine: a daemon that wedges under a live
	// session closes nothing, so the socket stays "open" and the shell just
	// freezes. The query takes no input, so React Query collapses every pane's
	// copy into one request per workspace.
	const healthQuery = workspaceTrpc.terminal.daemon.getHealth.useQuery(
		undefined,
		{ refetchInterval: DAEMON_HEALTH_POLL_MS },
	);
	const restartDaemon = workspaceTrpc.terminal.daemon.restart.useMutation({
		onSuccess: () => {
			toast.success("Daemon restarted", {
				description: "All terminal sessions were closed.",
			});
			void healthQuery.refetch();
		},
		onError: (error) => {
			toast.error("Failed to restart daemon", { description: error.message });
		},
	});

	// The daemon owns the shells, so if it has gone quiet that's the root
	// cause and it outranks whatever the WebSocket is reporting. Wait for a
	// sustained silence: the fix closes every terminal, and a brief stall
	// (e.g. an update relaunch) recovers on its own.
	const health = healthQuery.data;
	const daemonUnreachable =
		!!health &&
		!health.reachable &&
		health.unreachableForMs >= DAEMON_UNREACHABLE_WARN_MS;

	if (connectionHealthy && !daemonUnreachable) {
		return null;
	}
	// First connect hasn't had trouble yet — don't flash a status.
	if (
		connectionState === "connecting" &&
		logs.length === 0 &&
		!diagnosis &&
		!daemonUnreachable
	) {
		return null;
	}

	// Red only once the transport has stopped trying; amber covers both the
	// in-flight dial and the backoff pause between attempts.
	const gaveUp = diagnosis !== null && connectionState === "closed";
	const label = daemonUnreachable
		? "Terminals aren't responding"
		: gaveUp
			? "Disconnected"
			: "Reconnecting…";

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
							gaveUp || daemonUnreachable
								? "bg-destructive"
								: "animate-pulse bg-yellow-500",
						)}
					/>
					<span>{label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 p-3 text-xs">
				<div className="flex flex-col gap-2">
					<p className="cursor-text select-text text-muted-foreground">
						{daemonUnreachable
							? "Trying to reconnect — your sessions should come back on their own. Restarting closes every terminal."
							: (diagnosis?.message ??
								"The terminal connection dropped. Retrying automatically…")}
					</p>
					<div className="flex items-center gap-2">
						{daemonUnreachable ? (
							<Button
								size="sm"
								variant="outline"
								className="h-6 px-2 text-xs"
								disabled={restartDaemon.isPending}
								onClick={() => setConfirmRestartOpen(true)}
							>
								Restart anyway
							</Button>
						) : (
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
						)}
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
			<AlertDialog
				open={confirmRestartOpen}
				onOpenChange={setConfirmRestartOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Restart terminal daemon?</AlertDialogTitle>
						<AlertDialogDescription>
							This closes every terminal session in this workspace and any
							other, and can't be undone. If the daemon is only briefly stuck,
							waiting will bring your sessions back instead.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmRestartOpen(false);
								restartDaemon.mutate();
							}}
						>
							Restart daemon
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Popover>
	);
}
