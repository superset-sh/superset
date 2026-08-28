import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useHostsPresence } from "renderer/hooks/useHostsPresence";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isOnline: boolean;
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

	const activeOrganizationId = useActiveOrganizationId();
	const currentUserId = session?.user?.id ?? null;

	const { data: hostRows = [] } = cloudTrpc.v2Host.list.useQuery(undefined, {
		refetchInterval: 30_000,
	});

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
			}));
	}, [activeOrganizationId, currentUserId, hostMemberRows, hostRows]);

	const presenceTargets = useMemo(
		() =>
			activeOrganizationId
				? accessibleHosts.map((host) => ({
						organizationId: activeOrganizationId,
						machineId: host.machineId,
					}))
				: [],
		[accessibleHosts, activeOrganizationId],
	);
	const presence = useHostsPresence(presenceTargets);
	const hostsWithPresence = useMemo(
		() =>
			presence
				? accessibleHosts.map((host) => ({
						...host,
						isOnline: presence.get(host.machineId) ?? host.isOnline,
					}))
				: accessibleHosts,
		[accessibleHosts, presence],
	);

	const localHost = useMemo(
		() =>
			hostsWithPresence.find((host) => host.machineId === machineId) ?? null,
		[hostsWithPresence, machineId],
	);

	const otherHosts = useMemo(
		() =>
			hostsWithPresence
				.filter((host) => host.machineId !== machineId)
				.map((host) => ({
					id: host.machineId,
					name: host.name,
					isOnline: host.isOnline ?? false,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[hostsWithPresence, machineId],
	);

	// Always surface the local device, even if its host row hasn't loaded yet —
	// the picker is useless without "this device" present.
	return {
		currentDeviceName:
			localHost?.name ??
			(machineId
				? t({
						id: "dashboard.newWorkspaceModal.devicePicker.thisDevice",
						message: "This device",
					})
				: null),
		localHostId: localHost?.machineId ?? machineId,
		localHostIsOnline: localHost ? (localHost.isOnline ?? false) : null,
		activeHostUrl,
		otherHosts,
	};
}
