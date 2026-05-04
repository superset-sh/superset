// V2 Settings → Terminal → Manage daemon section.
//
// Talks to host-service's `terminal.daemon` namespace — the supervisor
// that owns pty-daemon's lifecycle lives there, not in desktop main.
// What's *not* duplicated from v1: kill-all-sessions, clear-history,
// per-row kill. Restart already achieves the kill-all effect for v2;
// scrollback is owned per-session by the daemon's ring buffer with no
// disk persistence; per-row kill belongs in the renderer's pane controls.
//
// Provider plumbing: workspaceTrpc needs a WorkspaceClientProvider with a
// real host URL. Settings routes are *outside* any per-workspace provider
// (they're org-level), so we mount our own here using the active org's
// host URL from LocalHostServiceProvider. Without this wrapping, hooks
// fall through to electron-trpc and fail with "no procedure on path
// terminal.daemon.*" — there's no such namespace on electron-trpc.

import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { cn } from "@superset/ui/utils";
import {
	WorkspaceClientProvider,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useState } from "react";
import { HiChevronRight } from "react-icons/hi2";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const REFETCH_WHILE_OPEN_MS = 5_000;

export function V2SessionsSection() {
	const { activeHostUrl } = useLocalHostService();
	if (!activeHostUrl) {
		return (
			<div className="space-y-1">
				<h3 className="text-sm font-medium">Manage daemon</h3>
				<p className="text-sm text-muted-foreground">
					Host service is starting…
				</p>
			</div>
		);
	}
	return (
		<WorkspaceClientProvider
			cacheKey="settings-daemon"
			key={activeHostUrl}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
			wsToken={() => getHostServiceWsToken(activeHostUrl)}
		>
			<V2SessionsSectionInner />
		</WorkspaceClientProvider>
	);
}

function V2SessionsSectionInner() {
	const [confirmRestartOpen, setConfirmRestartOpen] = useState(false);
	const [showSessionList, setShowSessionList] = useState(false);
	// Phase 2: when handoff fails, the failure dialog asks whether to
	// fall back to force-restart (which closes sessions). The reason
	// string from supervisor.update goes here so the user knows why.
	const [updateFailureReason, setUpdateFailureReason] = useState<string | null>(
		null,
	);

	const updateStatusQuery =
		workspaceTrpc.terminal.daemon.getUpdateStatus.useQuery(undefined, {
			refetchOnWindowFocus: true,
		});
	const sessionsQuery = workspaceTrpc.terminal.daemon.listSessions.useQuery(
		undefined,
		{
			// Poll while the user keeps the list expanded — sessions
			// die/come up while they watch. Otherwise refetch on focus only.
			refetchInterval: showSessionList ? REFETCH_WHILE_OPEN_MS : false,
			refetchOnWindowFocus: true,
		},
	);
	// Surface query errors so they're visible in renderer logs even when
	// the section's UI gracefully degrades to "Daemon unavailable".
	if (updateStatusQuery.error) {
		console.error(
			"[V2SessionsSection] getUpdateStatus error:",
			updateStatusQuery.error,
		);
	}
	if (sessionsQuery.error) {
		console.error(
			"[V2SessionsSection] listSessions error:",
			sessionsQuery.error,
		);
	}

	const restartDaemon = workspaceTrpc.terminal.daemon.restart.useMutation({
		onSuccess: () => {
			const versions = updateStatusQuery.data;
			toast.success("Daemon restarted", {
				description:
					versions && versions.running !== versions.expected
						? `Now running ${versions.expected} (was ${versions.running}). All sessions were closed.`
						: "All sessions were closed and a fresh daemon is running.",
			});
			void updateStatusQuery.refetch();
			void sessionsQuery.refetch();
		},
		onError: (error) => {
			toast.error("Failed to restart daemon", { description: error.message });
		},
	});

	const updateDaemon = workspaceTrpc.terminal.daemon.update.useMutation({
		onSuccess: (result) => {
			if (result.ok) {
				const versions = updateStatusQuery.data;
				toast.success("Daemon updated", {
					description:
						versions && versions.running !== versions.expected
							? `Now running ${versions.expected} (was ${versions.running}). All sessions preserved.`
							: "All sessions preserved across the upgrade.",
				});
				void updateStatusQuery.refetch();
				void sessionsQuery.refetch();
			} else {
				// Soft failure (snapshot write failed, successor never acked,
				// etc.). Sessions are still alive on the predecessor; the user
				// can retry or fall through to force-restart.
				setUpdateFailureReason(result.reason);
			}
		},
		onError: (error) => {
			// Transport-level failure (the wire request itself threw).
			setUpdateFailureReason(error.message);
		},
	});

	const sessions = sessionsQuery.data ?? null;
	const aliveCount =
		sessions === null ? null : sessions.filter((s) => s.alive).length;
	const updatePending = updateStatusQuery.data?.pending === true;
	const versions = updateStatusQuery.data;

	const sessionCountLabel = (() => {
		if (sessions === null) return "Daemon unavailable";
		if (aliveCount === 0) return "No sessions running";
		return `${aliveCount} session${aliveCount === 1 ? "" : "s"} running`;
	})();

	const versionLabel = (() => {
		if (!versions) return null;
		if (versions.running === "unknown") {
			return `bundled ${versions.expected}`;
		}
		if (updatePending) {
			return `${versions.running} → ${versions.expected} pending`;
		}
		return versions.running;
	})();

	const isUnavailable = sessions === null;
	const expandable = sessions !== null && sessions.length > 0;

	return (
		<>
			<div className="space-y-4">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 className="text-sm font-medium flex items-baseline gap-2">
							Manage daemon
							{versionLabel ? (
								<span className="text-xs font-mono font-normal text-muted-foreground/80">
									{versionLabel}
								</span>
							) : null}
						</h3>
						<p className="text-sm text-muted-foreground mt-0.5">
							Owns every PTY session and survives app restarts.
						</p>
					</div>
					<div className="flex flex-wrap gap-2 shrink-0">
						<Button
							variant="default"
							size="sm"
							disabled={
								sessions === null ||
								updateDaemon.isPending ||
								restartDaemon.isPending
							}
							onClick={() => updateDaemon.mutate()}
						>
							{updateDaemon.isPending ? "Updating…" : "Update daemon"}
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={updateDaemon.isPending || restartDaemon.isPending}
							onClick={() => setConfirmRestartOpen(true)}
						>
							Force restart
						</Button>
					</div>
				</div>

				<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
					{expandable ? (
						<button
							type="button"
							onClick={() => setShowSessionList((v) => !v)}
							className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
						>
							<HiChevronRight
								className={cn(
									"size-3 transition-transform",
									showSessionList && "rotate-90",
								)}
							/>
							<span
								aria-hidden
								className="size-1.5 rounded-full bg-emerald-500"
							/>
							{sessionCountLabel}
						</button>
					) : (
						<span
							className={cn(
								"inline-flex items-center gap-1.5",
								isUnavailable ? "text-destructive" : "text-muted-foreground",
							)}
						>
							<span
								aria-hidden
								className={cn(
									"size-1.5 rounded-full",
									isUnavailable ? "bg-destructive" : "bg-muted-foreground/60",
								)}
							/>
							{sessionCountLabel}
						</span>
					)}
					{updatePending ? (
						<span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-foreground/80">
							Update available
						</span>
					) : null}
				</div>

				{showSessionList && sessions && sessions.length > 0 ? (
					<div className="max-h-64 overflow-auto">
						<table className="w-full text-xs">
							<thead className="sticky top-0 bg-background">
								<tr className="text-muted-foreground">
									<th className="px-2 py-2 text-left font-medium">Session</th>
									<th className="px-2 py-2 text-right font-medium">PID</th>
									<th className="px-2 py-2 text-right font-medium">Size</th>
									<th className="px-2 py-2 text-left font-medium">Status</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border/40">
								{sessions.map((s) => (
									<tr key={s.id} className="hover:bg-muted/30">
										<td className="px-2 py-2 font-mono">{s.id}</td>
										<td className="px-2 py-2 text-right font-mono">
											{s.pid || "—"}
										</td>
										<td className="px-2 py-2 text-right font-mono">
											{s.cols}×{s.rows}
										</td>
										<td className="px-2 py-2">
											<span
												className={
													s.alive ? "text-foreground" : "text-muted-foreground"
												}
											>
												{s.alive ? "Alive" : "Exited"}
											</span>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : null}
			</div>

			<AlertDialog
				open={updateFailureReason !== null}
				onOpenChange={(open) => {
					if (!open) setUpdateFailureReason(null);
				}}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Update couldn't preserve sessions
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-1.5 text-muted-foreground">
								<span className="block">
									The daemon couldn't hand off your live sessions to the new
									binary. Reason:
								</span>
								<span className="block rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-foreground">
									{updateFailureReason ?? ""}
								</span>
								<span className="block">
									Force update will close every terminal session
									{aliveCount && aliveCount > 0
										? ` (${aliveCount} running)`
										: ""}{" "}
									and start a fresh daemon.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setUpdateFailureReason(null)}
						>
							Cancel
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={restartDaemon.isPending}
							onClick={() => {
								setUpdateFailureReason(null);
								restartDaemon.mutate();
							}}
						>
							Force update
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmRestartOpen}
				onOpenChange={setConfirmRestartOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							{updatePending
								? "Force restart and apply update?"
								: "Restart terminal daemon?"}
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-1.5 text-muted-foreground">
								<span className="block">
									This closes every terminal session for your organization
									{aliveCount && aliveCount > 0
										? ` (${aliveCount} running)`
										: ""}{" "}
									and starts a fresh daemon.
								</span>
								{updatePending && versions ? (
									<span className="block">
										Force restart will load{" "}
										<span className="font-mono">{versions.expected}</span>{" "}
										(currently running{" "}
										<span className="font-mono">{versions.running}</span>). To
										upgrade <em>without</em> closing sessions, click{" "}
										<span className="font-medium">Update daemon</span> instead.
									</span>
								) : null}
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmRestartOpen(false)}
						>
							Cancel
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={restartDaemon.isPending}
							onClick={() => {
								setConfirmRestartOpen(false);
								restartDaemon.mutate();
							}}
						>
							Restart and close sessions
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
