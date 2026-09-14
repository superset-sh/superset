import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlag } from "posthog-react-native";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

/**
 * The repo URL prefix each cloud workspace's pull requests live under, by
 * cloud workspace id: the primary repository it checked out.
 */
export function useCloudRepoPrefixes(): Map<string, string> {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const enabledByFlag = Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));

	const { data } = useQuery({
		queryKey: ["cloud", "cloudWorkspace", "repositories", organizationId],
		enabled: enabledByFlag && organizationId !== null,
		staleTime: 5 * 60_000,
		queryFn: () =>
			apiClient.cloudWorkspace.repositories.query({
				organizationId: organizationId as string,
			}),
	});
	return useMemo(() => {
		const prefixes = new Map<string, string>();
		for (const row of data ?? []) {
			if (row.position !== 0) continue;
			prefixes.set(
				row.cloudWorkspaceId,
				`https://github.com/${row.fullName}/`.toLowerCase(),
			);
		}
		return prefixes;
	}, [data]);
}
