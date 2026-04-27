import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";

export interface WorkspaceHostOption {
	id: string;
	name: string;
	isOnline: boolean;
}

interface UseWorkspaceHostOptionsResult {
	currentDeviceName: string | null;
	/** machineId of the current device (the one running this desktop app). */
	localHostId: string | null;
	activeHostUrl: string | null;
	otherHosts: WorkspaceHostOption[];
}

export function useWorkspaceHostOptions(): UseWorkspaceHostOptionsResult {
	const { data: session } = authClient.useSession();
	const collections = useCollections();
	const { machineId, activeHostUrl } = useLocalHostService();

	const activeOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (session?.session?.activeOrganizationId ?? null);
	const currentUserId = session?.user?.id ?? null;

	const { data: accessibleHosts = [] } = useLiveQuery(
		(q) =>
			q
				.from({ userHosts: collections.v2UsersHosts })
				.innerJoin({ hosts: collections.v2Hosts }, ({ userHosts, hosts }) =>
					eq(userHosts.hostId, hosts.machineId),
				)
				.where(({ userHosts, hosts }) =>
					and(
						eq(userHosts.userId, currentUserId ?? ""),
						eq(hosts.organizationId, activeOrganizationId ?? ""),
					),
				)
				.select(({ hosts }) => ({
					machineId: hosts.machineId,
					name: hosts.name,
					isOnline: hosts.isOnline,
				})),
		[activeOrganizationId, collections, currentUserId],
	);

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
					isOnline: host.isOnline ?? false,
				}))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[accessibleHosts, machineId],
	);

	return {
		currentDeviceName: localHost?.name ?? null,
		localHostId: localHost?.machineId ?? null,
		activeHostUrl,
		otherHosts,
	};
}
