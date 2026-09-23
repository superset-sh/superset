import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { MOCK_ORG_ID } from "shared/constants";
import { deriveHostProjectsQueryTargets } from "../useHostProjects/useHostProjects.utils";
import {
	getHostProjectGroupsQueryKey,
	type HostProjectGroup,
} from "./useHostProjectGroups.utils";

export type {
	HostProjectGroup,
	HostProjectGroupMember,
} from "./useHostProjectGroups.utils";

const PROJECT_GROUPS_REFETCH_INTERVAL_MS = 30_000;

export interface UseHostProjectGroupsResult {
	groups: HostProjectGroup[];
	isReady: boolean;
}

export function useHostProjectGroups({
	enabled,
}: {
	enabled: boolean;
}): UseHostProjectGroupsResult {
	const { activeHostUrl, machineId, activeOrganizationId } =
		useLocalHostService();
	const relayUrl = useRelayUrl();
	const fallbackOrganizationId = env.SKIP_ENV_VALIDATION
		? MOCK_ORG_ID
		: (activeOrganizationId ?? null);
	const { hosts, settled: knownHostsSettled } = useKnownHosts();

	const targets = useMemo(
		() =>
			deriveHostProjectsQueryTargets({
				activeHostUrl,
				hosts,
				machineId,
				relayUrl,
				fallbackOrganizationId,
			}),
		[activeHostUrl, hosts, machineId, relayUrl, fallbackOrganizationId],
	);

	const queries = useQueries({
		queries: targets.map((target) => ({
			queryKey: getHostProjectGroupsQueryKey(target),
			enabled: enabled && target.hostUrl !== null,
			refetchInterval: PROJECT_GROUPS_REFETCH_INTERVAL_MS,
			networkMode: "always" as const,
			retry: 1,
			queryFn: async (): Promise<HostProjectGroup[]> => {
				if (!target.hostUrl) return [];
				const client = getHostServiceClientByUrl(target.hostUrl);
				const { groups } = await client.projectGroups.list.query();
				return groups.map((group) => ({
					...group,
					hostId: target.machineId,
				}));
			},
		})),
	});

	const groups = useMemo(
		() => queries.flatMap((query) => query.data ?? []),
		[queries],
	);

	const isReady =
		enabled &&
		knownHostsSettled &&
		targets.length > 0 &&
		queries.every(
			(query, index) =>
				query.isSuccess || query.isError || targets[index]?.hostUrl === null,
		);

	return { groups, isReady };
}
