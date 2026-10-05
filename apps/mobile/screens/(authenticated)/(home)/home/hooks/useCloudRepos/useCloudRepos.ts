import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { useFeatureFlag } from "posthog-react-native";
import { useMemo } from "react";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

/** Each cloud workspace's primary repository, `owner/name`, by cloud workspace id. */
export function useCloudRepos(): Map<string, string> {
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
	return useMemo(
		() =>
			new Map(
				(data ?? [])
					.filter((row) => row.primary)
					.map((row) => [row.cloudWorkspaceId, row.fullName]),
			),
		[data],
	);
}
