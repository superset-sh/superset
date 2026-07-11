import hostServicePackageJson from "@superset/host-service/package.json" with {
	type: "json",
};
import { compareHostVersions } from "@superset/shared/host-version";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const EXPECTED_HOST_SERVICE_VERSION: string =
	hostServicePackageJson.version;

export type HostVersionState = "match" | "outdated" | "newer" | "invalid";

export function getHostVersionState(
	runningVersion: string,
	expectedVersion: string,
): HostVersionState {
	const order = compareHostVersions(runningVersion, expectedVersion);
	if (order === null) return "invalid";
	if (order === 0) return "match";
	return order < 0 ? "outdated" : "newer";
}

export function hostInfoQueryKey(organizationId: string, machineId: string) {
	return ["remoteHostInfo", organizationId, machineId] as const;
}

interface UseHostInfoOptions {
	enabled?: boolean;
	refetchInterval?: number | false;
}

interface UseHostInfoInput {
	hostUrl: string | null;
	organizationId: string;
	machineId: string;
}

export function useHostInfo(
	{ hostUrl, organizationId, machineId }: UseHostInfoInput,
	options?: UseHostInfoOptions,
) {
	return useQuery({
		queryKey: hostInfoQueryKey(organizationId, machineId),
		enabled:
			Boolean(hostUrl && organizationId && machineId) &&
			(options?.enabled ?? true),
		queryFn: ({ signal }) => {
			if (!hostUrl) throw new Error("Host unavailable");
			return getHostServiceClientByUrl(hostUrl).host.info.query(undefined, {
				signal,
			});
		},
		staleTime: 30_000,
		refetchInterval: options?.refetchInterval ?? false,
		refetchIntervalInBackground:
			options?.refetchInterval !== undefined &&
			options.refetchInterval !== false,
		retry: false,
	});
}
