import { useLingui } from "@lingui/react/macro";
import {
	deriveHostVersionState,
	type HostVersionState,
} from "@superset/shared/host-version";
import { useMemo } from "react";
import { useAppVersion } from "renderer/hooks/host-version/useHostVersionState";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isOnline: boolean;
	version: string | null;
	versionState: HostVersionState;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	/** machineId of the current device (the one running this desktop app). */
	localHostId: string | null;
	/**
	 * Relay connectivity of the local device as the cloud sees it; null while
	 * its host row hasn't loaded. Cloud-dispatched work (automations) needs
	 * this even for the local device.
	 */
	localHostIsOnline: boolean | null;
	activeHostUrl: string | null;
	otherHosts: WorkspaceHostOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { t } = useLingui();
	const { data: session } = authClient.useSession();
	const { machineId, activeHostUrl } = useLocalHostService();
	const appVersion = useAppVersion();

	const activeOrganizationId = useActiveOrganizationId();
	const currentUserId = session?.user?.id ?? null;

	const { hosts: hostRows } = useKnownHosts();

	const { data: hostMemberRows = [] } =
		cloudTrpc.v2Host.listMembers.useQuery(undefined);

	const accessibleHosts = useMemo(() => {
		const accessibleHostIds = new Set(
			hostMemberRows
				.filter((member) => member.userId === (currentUserId ?? ""))
				.map((member) => member.hostId),
		);
		return hostRows
			.filter(
				(host) =>
					host.organizationId === (activeOrganizationId ?? "") &&
					accessibleHostIds.has(host.machineId),
			)
			.map((host) => ({
				machineId: host.machineId,
				name: host.name,
				isOnline: host.isOnline,
				version: host.version,
			}));
	}, [activeOrganizationId, currentUserId, hostMemberRows, hostRows]);

	const localHost = useMemo(
		() => accessibleHosts.find((host) => host.machineId === machineId) ?? null,
		[accessibleHosts, machineId],
	);

	const otherHosts = useMemo(
		() =>
			accessibleHosts
				.filter((host) => host.machineId !== machineId)
				.map((host) => ({
					id: host.machineId,
					name: host.name,
					isOnline: host.isOnline,
					version: host.version,
					versionState: deriveHostVersionState(host.version, appVersion),
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[accessibleHosts, machineId, appVersion],
	);

	// Always surface the local device, even if its host row hasn't loaded yet —
	// the picker is useless without "this device" present.
	return {
		currentDeviceName:
			localHost?.name ??
			(machineId
				? t({
						message: "This device",
					})
				: null),
		localHostId: localHost?.machineId ?? machineId,
		localHostIsOnline: localHost ? localHost.isOnline : null,
		activeHostUrl,
		otherHosts,
	};
}
