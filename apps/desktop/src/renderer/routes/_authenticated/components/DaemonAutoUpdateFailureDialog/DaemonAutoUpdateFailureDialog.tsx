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
import {
	WorkspaceClientProvider,
	workspaceTrpc,
} from "@superset/workspace-client";
import { useEffect, useState } from "react";
import {
	getHostServiceHeaders,
	getHostServiceWsToken,
} from "renderer/lib/host-service-auth";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

const STATUS_REFETCH_MS = 5_000;

export function DaemonAutoUpdateFailureDialog() {
	const { activeHostUrl } = useLocalHostService();
	if (!activeHostUrl) return null;
	return (
		<WorkspaceClientProvider
			cacheKey="daemon-auto-update-failure"
			key={activeHostUrl}
			hostUrl={activeHostUrl}
			headers={() => getHostServiceHeaders(activeHostUrl)}
			wsToken={() => getHostServiceWsToken(activeHostUrl)}
		>
			<DaemonAutoUpdateFailureDialogInner />
		</WorkspaceClientProvider>
	);
}

function DaemonAutoUpdateFailureDialogInner() {
	const [activeFailureId, setActiveFailureId] = useState<string | null>(null);
	const [dismissedFailureId, setDismissedFailureId] = useState<string | null>(
		null,
	);

	const updateStatusQuery =
		workspaceTrpc.terminal.daemon.getUpdateStatus.useQuery(undefined, {
			refetchInterval: STATUS_REFETCH_MS,
			refetchOnWindowFocus: true,
		});
	const sessionsQuery = workspaceTrpc.terminal.daemon.listSessions.useQuery(
		undefined,
		{
			enabled: activeFailureId !== null,
			refetchOnWindowFocus: true,
		},
	);
	const restartDaemon = workspaceTrpc.terminal.daemon.restart.useMutation({
		onSuccess: () => {
			toast.success("Daemon restarted", {
				description: "All sessions were closed and a fresh daemon is running.",
			});
			void updateStatusQuery.refetch();
		},
		onError: (error) => {
			toast.error("Failed to restart daemon", { description: error.message });
		},
	});

	const failure = updateStatusQuery.data?.autoUpdateFailure ?? null;
	useEffect(() => {
		if (!failure) {
			setActiveFailureId(null);
			return;
		}
		if (failure.id === dismissedFailureId) return;
		setActiveFailureId(failure.id);
	}, [failure, dismissedFailureId]);

	const closeDialog = () => {
		if (activeFailureId) setDismissedFailureId(activeFailureId);
		setActiveFailureId(null);
	};

	const sessions = sessionsQuery.data ?? null;
	const aliveCount =
		sessions === null
			? null
			: sessions.filter((session) => session.alive).length;

	return (
		<AlertDialog
			open={activeFailureId !== null && !!failure}
			onOpenChange={(open) => {
				if (!open) closeDialog();
			}}
		>
			<AlertDialogContent className="max-w-[520px] gap-0 p-0">
				<AlertDialogHeader className="px-4 pt-4 pb-2">
					<AlertDialogTitle className="font-medium">
						Daemon update needs confirmation
					</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-1.5 text-muted-foreground">
							<span className="block">
								Superset tried to update the terminal daemon without closing
								sessions, but the handoff did not finish. Reason:
							</span>
							<span className="block rounded bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-foreground">
								{failure?.reason ?? ""}
							</span>
							<span className="block">
								Force update will close every terminal session
								{aliveCount && aliveCount > 0 ? ` (${aliveCount} running)` : ""}{" "}
								and start a fresh daemon.
							</span>
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter className="flex-row justify-end gap-2 px-4 pb-4 pt-2">
					<Button variant="ghost" size="sm" onClick={closeDialog}>
						Keep current daemon
					</Button>
					<Button
						variant="default"
						size="sm"
						disabled={restartDaemon.isPending}
						onClick={() => {
							closeDialog();
							restartDaemon.mutate();
						}}
					>
						Force update
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
