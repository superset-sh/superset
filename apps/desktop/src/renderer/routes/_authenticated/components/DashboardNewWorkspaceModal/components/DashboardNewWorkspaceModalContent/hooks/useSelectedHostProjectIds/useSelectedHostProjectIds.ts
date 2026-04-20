import { useQuery } from "@tanstack/react-query";
import { env } from "renderer/env.renderer";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type { WorkspaceHostTarget } from "../../../DashboardNewWorkspaceForm/components/DevicePicker/types";

/**
 * IDs of projects already set up on the selected host. Returns `null` when
 * we couldn't reach that host (treat as "unknown" — no setup indicator).
 */
export function useSelectedHostProjectIds(
	hostTarget: WorkspaceHostTarget,
): Set<string> | null {
	const { activeHostUrl } = useLocalHostService();
	const hostUrl =
		hostTarget.kind === "local"
			? activeHostUrl
			: `${env.RELAY_URL}/hosts/${hostTarget.hostId}`;

	const { data } = useQuery({
		queryKey: ["project", "list", hostUrl],
		enabled: !!hostUrl,
		queryFn: async () => {
			if (!hostUrl) return null;
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				const rows = await client.project.list.query();
				return new Set(rows.map((row) => row.id));
			} catch {
				return null;
			}
		},
	});

	return data ?? null;
}
