import { useWorkspaceHostOptions } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions/useWorkspaceHostOptions";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

/**
 * Resolve an automation target hostId to the local device or a remote host,
 * with the relay connectivity the cloud dispatcher sees.
 */
export function useRelayHostTarget(hostId: string | null) {
	const { machineId } = useLocalHostService();
	const { localHostId, localHostIsOnline, otherHosts } =
		useWorkspaceHostOptions();

	const isLocal =
		hostId === null || hostId === machineId || hostId === localHostId;
	const remoteHost = isLocal
		? null
		: (otherHosts.find((host) => host.id === hostId) ?? null);

	return { isLocal, remoteHost, localHostIsOnline };
}
