import { useLingui } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { toast } from "@superset/ui/sonner";
import { useDelayElapsed } from "renderer/hooks/useDelayElapsed";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { StateScreenShell } from "../../../../components/StateScreenShell";
import { WorkspaceHostUnreachableState } from "../../../../components/WorkspaceHostUnreachableState";
import { LOCAL_HOST_SERVICE_DETAIL } from "../../utils/localHostServiceDetail";

/**
 * The workspace lives on this device but the local host service has no port
 * yet — it is starting, wedged, or stopped. The provider polls for it every 5s,
 * so hold a blank frame briefly (normal at boot) before saying anything.
 */
const LOCAL_HOST_GRACE_MS = 10_000;

export function WorkspaceLocalHostPendingState({ hostId }: { hostId: string }) {
	const { t } = useLingui();
	const { hostServiceStatus, activeOrganizationId } = useLocalHostService();
	const showState = useDelayElapsed(true, LOCAL_HOST_GRACE_MS);

	const restart = electronTrpc.hostServiceCoordinator.restart.useMutation({
		onError: (error) => {
			toast.error(
				t({
					message: "Couldn't restart the host service",
				}),
				{
					description: t({
						message: `${error.message} — try the Superset tray menu > Host Service > Restart.`,
					}),
				},
			);
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
				hostName={t({
					message: "This device",
				})}
				detail={i18n._(LOCAL_HOST_SERVICE_DETAIL[hostServiceStatus])}
				isReconnecting={isStarting}
				retryLabel={t({
					message: "Restart host service",
				})}
				retryBusyLabel={t({
					message: "Starting…",
				})}
				onRetry={() => {
					if (isStarting) return;
					// The button reads as enabled without an org, so swallowing the
					// click here would look like the restart silently failed.
					if (!activeOrganizationId) {
						toast.error(
							t({
								message: "No active organization",
							}),
							{
								description: t({
									message:
										"Switch organization or sign in again to restart the host service.",
								}),
							},
						);
						return;
					}
					restart.mutate({ organizationId: activeOrganizationId });
				}}
			/>
		</StateScreenShell>
	);
}
