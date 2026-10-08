import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useFeatureFlag } from "posthog-react-native";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";
import { withPendingCloudMoves } from "../useCloudWorkspaceActions/pendingCloudMoves";
import type { CloudWorkspaceRow } from "../useCloudWorkspaces";
import { reviveCloudWorkspaceRows } from "../useCloudWorkspaces/reviveCloudWorkspaceRow";

const NO_ROWS: CloudWorkspaceRow[] = [];

export function getArchivedCloudWorkspacesQueryKey(
	organizationId: string | null,
) {
	return [
		"cloud",
		"cloudWorkspace",
		"list",
		organizationId,
		"archived",
	] as const;
}

export function useArchivedCloudWorkspaces({
	enabled = true,
}: {
	enabled?: boolean;
} = {}): {
	workspaces: CloudWorkspaceRow[];
	isReady: boolean;
} {
	const enabledByFlag = Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useQuery({
		queryKey: getArchivedCloudWorkspacesQueryKey(organizationId),
		enabled: enabled && enabledByFlag && organizationId !== null,
		networkMode: "always" as const,
		retry: (count, error) =>
			!(error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") &&
			count < 2,
		select: reviveCloudWorkspaceRows,
		queryFn: async (): Promise<CloudWorkspaceRow[]> => {
			if (!organizationId) return NO_ROWS;
			try {
				return withPendingCloudMoves(
					"archived",
					await apiClient.cloudWorkspace.list.query({
						organizationId,
						archived: true,
					}),
				);
			} catch (error) {
				if (
					error instanceof TRPCClientError &&
					error.data?.code === "FORBIDDEN"
				) {
					return NO_ROWS;
				}
				throw error;
			}
		},
	});

	return {
		workspaces: query.data ?? NO_ROWS,
		isReady:
			!enabled ||
			!enabledByFlag ||
			organizationId === null ||
			query.isSuccess ||
			query.isError,
	};
}
