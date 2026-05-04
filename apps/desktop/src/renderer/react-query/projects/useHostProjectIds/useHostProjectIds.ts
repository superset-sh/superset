import { useQuery } from "@tanstack/react-query";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

export const hostProjectListQueryKey = (hostUrl: string | null) =>
	["project", "list", hostUrl] as const;

/**
 * IDs of projects already set up on the given host. Returns `null` when the
 * host couldn't be reached (treat as "unknown" — no setup indicator).
 */
export function useHostProjectIds(hostUrl: string | null): Set<string> | null {
	const { data } = useQuery({
		queryKey: hostProjectListQueryKey(hostUrl),
		enabled: !!hostUrl,
		queryFn: async () => {
			if (!hostUrl) return null;
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				const rows = await client.project.list.query();
				return new Set(rows.map((row) => row.id));
			} catch (err) {
				console.warn("useHostProjectIds: failed to list projects", {
					hostUrl,
					err,
				});
				return null;
			}
		},
	});

	return data ?? null;
}
