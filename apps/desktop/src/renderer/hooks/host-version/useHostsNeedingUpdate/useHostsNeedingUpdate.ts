import {
	deriveHostVersionState,
	hostNeedsUpdate,
} from "@superset/shared/host-version";
import { useMemo } from "react";
import { useKnownHosts } from "renderer/hooks/known-hosts/useKnownHosts";
import { useAppVersion } from "../useHostVersionState";

/**
 * How many of this org's hosts last registered with a host-service older
 * than this app. Drives the count on the Hosts entry in Settings; nothing
 * else nags about it.
 */
export function useHostsNeedingUpdateCount(): number {
	const appVersion = useAppVersion();
	const { hosts } = useKnownHosts();
	return useMemo(
		() =>
			hosts.filter((host) =>
				hostNeedsUpdate(deriveHostVersionState(host.version, appVersion)),
			).length,
		[hosts, appVersion],
	);
}
