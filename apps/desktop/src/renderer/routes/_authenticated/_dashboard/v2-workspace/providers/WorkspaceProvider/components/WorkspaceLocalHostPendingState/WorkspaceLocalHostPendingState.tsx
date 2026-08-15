import { toast } from "@superset/ui/sonner";
import { useEffect } from "react";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { StateScreenShell } from "../../../../components/StateScreenShell";
import { WorkspaceHostUnreachableState } from "../../../../components/WorkspaceHostUnreachableState";

/**
 * The workspace lives on this device but the local host service has no port
 * yet — it is starting, wedged, or stopped. The provider polls for it every 5s,
 * so hold a blank frame briefly (normal at boot) before saying anything.
 */
const LOCAL_HOST_GRACE_MS = 10_000;

const DETAIL_BY_STATUS = {
	starting:
		"The local host service is still starting up. It should be ready in a few seconds.",
	stopped:
		"The local host service isn't running, so nothing on this device can serve the workspace. Restarting it reattaches your terminals and files — nothing on disk is lost.",
	// The process is up but its port hasn't reached us yet: getProcessStatus
	// polls every second, the connection every five. Never advise a restart
	// here — the service is healthy and this clears itself.
	running: "The local host service just came up. Reconnecting to it now.",
	unknown:
		"The local host service isn't responding. Restarting it usually clears this; if it keeps happening, restart Superset.",
} as const;

export function WorkspaceLocalHostPendingState({ hostId }: { hostId: string }) {
	const { hostServiceStatus, activeOrganizationId } = useLocalHostService();
	const showState = useDelayElapsed(true, LOCAL_HOST_GRACE_MS);
	const utils = electronTrpc.useUtils();

	// The process reports running before the 5s connection poll hands us its
	// port. Ask for the port now rather than leaving this screen up over a
	// host service that is already serving.
	useEffect(() => {
		if (hostServiceStatus !== "running") return;
		void utils.hostServiceCoordinator.getConnection.invalidate();
	}, [hostServiceStatus, utils]);

	const restart = electronTrpc.hostServiceCoordinator.restart.useMutation({
		onError: (error) => {
			toast.error("Couldn't restart the host service", {
				description: `${error.message} — try the Superset tray menu > Host Service > Restart.`,
			});
		},
	});

	if (!showState) return <div className="flex h-full w-full" />;

	// Restarting mid-start races the pending spawn, exactly as the tray menu
	// avoids — and "running" here means a healthy service whose port is still
	// in flight. Both show progress instead of inviting a restart.
	const isStarting =
		hostServiceStatus === "starting" ||
		hostServiceStatus === "running" ||
		restart.isPending;

	return (
		<StateScreenShell>
			<WorkspaceHostUnreachableState
				hostId={hostId}
				hostName="This device"
				detail={DETAIL_BY_STATUS[hostServiceStatus]}
				isReconnecting={isStarting}
				retryLabel="Restart host service"
				retryBusyLabel="Starting…"
				onRetry={() => {
					if (isStarting) return;
					// The button reads as enabled without an org, so swallowing the
					// click here would look like the restart silently failed.
					if (!activeOrganizationId) {
						toast.error("No active organization", {
							description:
								"Switch organization or sign in again to restart the host service.",
						});
						return;
					}
					restart.mutate({ organizationId: activeOrganizationId });
				}}
			/>
		</StateScreenShell>
	);
}
