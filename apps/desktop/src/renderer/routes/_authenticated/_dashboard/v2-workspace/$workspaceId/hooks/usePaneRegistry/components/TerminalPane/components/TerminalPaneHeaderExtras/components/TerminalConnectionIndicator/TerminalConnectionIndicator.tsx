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
import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
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
 * Three modes: "reconnecting" (amber, auto-retry in flight), "unresponsive"
 * (amber — the daemon owns the shells and has gone quiet, usually self-heals),
 * and "disconnected" (red — the transport gave up and needs a manual retry).
 * Amber means "still working itself out"; red is reserved for the one state
 * that needs the user. User-facing copy says "terminals", never "daemon".
 *
 * The WebSocket drives reconnecting/disconnected; the host-reported pty-daemon
 * health drives unresponsive (shown after {@link DAEMON_UNREACHABLE_WARN_MS}),
 * which outranks the socket story since a wedged daemon closes nothing and just
 * freezes the shell. Restart closes every terminal, so it sits behind a confirm
 * (with a "Keep waiting" cancel) and we wait out short stalls rather than offer
 * it eagerly — a transient stall usually clears on its own.
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
	const [showLog, setShowLog] = useState(false);

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
			toast.success("Terminals restarted", {
				description: "All terminal sessions were closed.",
			});
			void healthQuery.refetch();
		},
		onError: (error) => {
			toast.error("Couldn't restart terminals", { description: error.message });
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

	// Three failure modes so copy + colour name the fix that applies. Amber =
	// still working itself out (auto-retry, or a stall that usually self-heals);
	// red = we've stopped trying and need the user.
	const gaveUp = diagnosis !== null && connectionState === "closed";
	const mode = daemonUnreachable
		? "unresponsive"
		: gaveUp
			? "disconnected"
			: "reconnecting";
	const reconnecting = connectionState === "connecting";
	const label =
		mode === "unresponsive"
			? "Terminals aren't responding"
			: mode === "disconnected"
				? "Disconnected"
				: "Reconnecting…";
	const StatusIcon = mode === "reconnecting" ? Loader2 : TriangleAlert;
	const accentClass =
		mode === "disconnected" ? "text-destructive" : "text-yellow-500";
	const dotClass =
		mode === "disconnected"
			? "bg-destructive"
			: mode === "unresponsive"
				? "bg-yellow-500"
				: "animate-pulse bg-yellow-500";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Terminal connection: ${label}`}
					className="flex h-5 items-center gap-1.5 rounded px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
				>
					<span className={cn("size-1.5 rounded-full", dotClass)} />
					<span>{label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className={cn("overflow-hidden p-0 text-sm", showLog ? "w-96" : "w-64")}
			>
				<div className="flex flex-col gap-3 p-4">
					<div className="flex items-center gap-2.5">
						<StatusIcon
							className={cn(
								"size-4 shrink-0",
								accentClass,
								mode === "reconnecting" && "animate-spin",
							)}
						/>
						<p className="font-medium text-foreground">{label}</p>
					</div>
					{/* Reconnect (solid) leads as the safe primary; Restart (outline)
					    is distinct but quieter, red only on hover so the destructive path
					    never looks like the obvious one. Both can apply at once (a wedged
					    daemon doesn't close the socket, but after sleep/wake the transport
					    may have given up too), so we never leave restart as the only offer.
					    A lone button flexes to full width. */}
					<div className="flex gap-2">
						{!connectionHealthy && (
							<Button
								className="flex-1 gap-2"
								disabled={reconnecting}
								onClick={() =>
									terminalRuntimeRegistry.retryConnect(
										terminalId,
										terminalInstanceId,
									)
								}
							>
								{reconnecting ? (
									<>
										<Loader2 className="animate-spin" />
										Reconnecting…
									</>
								) : (
									<>
										<RotateCw />
										Reconnect
									</>
								)}
							</Button>
						)}
						{daemonUnreachable && (
							<Button
								variant="outline"
								className="flex-1 hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
								disabled={restartDaemon.isPending}
								onClick={() => setConfirmRestartOpen(true)}
							>
								Restart
							</Button>
						)}
					</div>
					{logs.length > 0 && (
						<button
							type="button"
							onClick={() => setShowLog((v) => !v)}
							className="self-center text-xs text-muted-foreground/70 transition-colors hover:text-foreground"
						>
							{showLog ? "Hide log" : "View log"}
						</button>
					)}
				</div>
				{showLog && logs.length > 0 && (
					<div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-3">
						{/* column-reverse pins the scroll to the newest entry; the list
						   is reversed so reading order stays chronological. Timestamp is a
						   small header above each line, not a left column, so the message
						   gets the full width instead of wrapping in a narrow gutter. */}
						<div className="flex max-h-44 flex-col-reverse overflow-y-auto font-mono text-xs">
							{logs
								.slice()
								.reverse()
								.map((entry) => (
									<div
										key={entry.id}
										className="flex cursor-text select-text flex-col gap-0.5 py-1"
									>
										<span className="text-[10px] tabular-nums text-muted-foreground/50">
											{formatTime(entry.timestamp)}
										</span>
										<span
											className={cn(
												"[overflow-wrap:anywhere]",
												entry.level === "error" && "text-destructive",
											)}
										>
											{entry.message}
										</span>
									</div>
								))}
						</div>
						<button
							type="button"
							onClick={() =>
								navigator.clipboard
									.writeText(formatLogsForClipboard(logs))
									.catch((error) =>
										console.error("[terminal] copy log failed:", error),
									)
							}
							className="self-start text-muted-foreground transition-colors hover:text-foreground"
						>
							Copy log
						</button>
					</div>
				)}
			</PopoverContent>
			<AlertDialog
				open={confirmRestartOpen}
				onOpenChange={setConfirmRestartOpen}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Restart all terminals?</AlertDialogTitle>
						<AlertDialogDescription>
							This closes every terminal session — in this workspace and any
							others — and can't be undone. If they're only briefly stuck,
							waiting usually brings them back.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep waiting</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								setConfirmRestartOpen(false);
								restartDaemon.mutate();
							}}
						>
							Restart terminals
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Popover>
	);
}
