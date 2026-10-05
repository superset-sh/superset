import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useArchivedCloudWorkspace(
	workspaceId: string,
	enabled: boolean,
) {
	const flagEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const organizationId = useActiveOrganizationId();
	const { data } = cloudTrpc.cloudWorkspace.list.useQuery(
		{ organizationId: organizationId ?? "", archived: true },
		{
			enabled: enabled && Boolean(flagEnabled && organizationId),
			// An archive seeds this list before the server has the row, so a
			// refetch on enable would drop it; the archive refetches once it lands.
			staleTime: 30_000,
		},
	);
	return data?.find((row) => row.id === workspaceId) ?? null;
}
