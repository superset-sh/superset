import { useQuery } from "@tanstack/react-query";
import {
	getHostServiceClientByUrl,
	hostServiceQueryRetry,
	hostServiceQueryRetryDelay,
} from "renderer/lib/host-service-client";

import { readHostServiceInfo } from "./useHostServiceInfo.utils";

export type { HostServiceInfo } from "./useHostServiceInfo.utils";

export const HOST_SERVICE_INFO_STALE_MS = 30_000;

export async function fetchHostServiceInfo(hostUrl: string) {
	return readHostServiceInfo(getHostServiceClientByUrl(hostUrl));
}

export function hostServiceInfoQueryKey(hostUrl: string | null) {
	return ["host-service-info", hostUrl] as const;
}

/**
 * Live health and optional host info from `hostUrl`: the version and
 * install source actually serving right now, as opposed to what the cloud
 * row remembers from its last registration.
 */
export function useHostServiceInfo(hostUrl: string | null, enabled = true) {
	return useQuery({
		queryKey: hostServiceInfoQueryKey(hostUrl),
		queryFn: () => {
			if (!hostUrl) throw new Error("no host url");
			return fetchHostServiceInfo(hostUrl);
		},
		enabled: enabled && hostUrl !== null,
		staleTime: HOST_SERVICE_INFO_STALE_MS,
		retry: hostServiceQueryRetry,
		retryDelay: hostServiceQueryRetryDelay,
	});
}
