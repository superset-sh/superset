import { MIN_HOST_SERVICE_VERSION } from "@superset/shared/host-version";
import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "@/lib/host-service/client";

const HOST_INFO_STALE_MS = 30_000;

export interface HostCompatibility {
	/** The host answered with a version below the shared wire-contract floor. */
	incompatible: boolean;
	hostVersion: string | null;
	minVersion: string;
}

/**
 * Port of desktop's useRemoteHostStatus version gate. Every host is remote
 * from the phone, so the shared MIN_HOST_SERVICE_VERSION floor always
 * applies. Fails open: an unreachable host or unparseable version never
 * blocks the screen — only a successful answer below the floor does.
 */
export function useHostCompatibility(
	hostUrl: string | null,
): HostCompatibility {
	const query = useQuery({
		queryKey: ["host-info", hostUrl],
		enabled: hostUrl !== null,
		staleTime: HOST_INFO_STALE_MS,
		retry: 1,
		networkMode: "always" as const,
		queryFn: async () => {
			if (!hostUrl) throw new Error("no host");
			return getHostServiceClientByUrl(hostUrl).host.info.query();
		},
	});

	const hostVersion = query.data?.version ?? null;
	return {
		incompatible:
			hostVersion !== null &&
			!meetsMinimum(hostVersion, MIN_HOST_SERVICE_VERSION),
		hostVersion,
		minVersion: MIN_HOST_SERVICE_VERSION,
	};
}

/** x.y.z compare, prerelease suffix ignored; unparseable counts as meeting. */
function meetsMinimum(version: string, minimum: string): boolean {
	const parse = (value: string): number[] | null => {
		const parts = value.trim().split("-")[0]?.split(".") ?? [];
		if (parts.length < 3) return null;
		const numbers = parts.slice(0, 3).map(Number);
		return numbers.some(Number.isNaN) ? null : numbers;
	};
	const actual = parse(version);
	const floor = parse(minimum);
	if (!actual || !floor) return true;
	for (let index = 0; index < 3; index++) {
		const a = actual[index] ?? 0;
		const b = floor[index] ?? 0;
		if (a !== b) return a > b;
	}
	return true;
}
