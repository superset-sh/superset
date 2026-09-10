import {
	deriveHostVersionState,
	hostNeedsUpdate,
} from "@superset/shared/host-version";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useAppVersion } from "../useHostVersionState";

/**
 * How many of this org's hosts last registered with a host-service older
 * than this app. Drives the count on the Hosts entry in Settings; nothing
 * else nags about it.
 */
export function useHostsNeedingUpdateCount(): number {
	const appVersion = useAppVersion();
	const { data: hosts = [] } = cloudTrpc.v2Host.list.useQuery(undefined, {
		staleTime: 30_000,
	});
	return useMemo(
		() =>
			hosts.filter((host) =>
				hostNeedsUpdate(deriveHostVersionState(host.version, appVersion)),
			).length,
		[hosts, appVersion],
	);
}
