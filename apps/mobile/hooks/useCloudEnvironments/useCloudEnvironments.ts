import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type CloudEnvironmentRow = RouterOutputs["environment"]["list"][number];

export function getCloudEnvironmentsQueryKey(organizationId: string | null) {
	return ["cloud", "environment", "list", organizationId] as const;
}

/**
 * Environments a cloud workspace can be created in: the organization's own,
 * plus the shared ones every organization reads.
 */
export function useCloudEnvironments() {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	return useQuery({
		queryKey: getCloudEnvironmentsQueryKey(organizationId),
		enabled: organizationId !== null,
		queryFn: () =>
			apiClient.environment.list.query({
				organizationId: organizationId as string,
			}),
	});
}
