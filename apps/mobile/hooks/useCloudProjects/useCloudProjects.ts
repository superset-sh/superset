import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useFeatureFlag } from "posthog-react-native";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type CloudProjectRow =
	RouterOutputs["cloudWorkspace"]["listProjects"][number];

const NO_PROJECTS: CloudProjectRow[] = [];

/**
 * Projects a cloud workspace can be created from, straight from the API — the
 * one create source that works with zero machines online. Gated like the
 * cloud list: the flag decides whether to ask, and a FORBIDDEN answer means
 * "none", not an error.
 */
export function useCloudProjects(): {
	projects: CloudProjectRow[];
	organizationId: string | null;
} {
	const enabledByFlag = Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useQuery({
		queryKey: ["cloud", "cloudWorkspace", "listProjects", organizationId],
		enabled: enabledByFlag && organizationId !== null,
		staleTime: 60_000,
		networkMode: "always" as const,
		retry: (count, error) =>
			!(error instanceof TRPCClientError && error.data?.code === "FORBIDDEN") &&
			count < 2,
		queryFn: async (): Promise<CloudProjectRow[]> => {
			if (!organizationId) return NO_PROJECTS;
			try {
				return await apiClient.cloudWorkspace.listProjects.query({
					organizationId,
				});
			} catch (error) {
				if (
					error instanceof TRPCClientError &&
					error.data?.code === "FORBIDDEN"
				) {
					return NO_PROJECTS;
				}
				throw error;
			}
		},
	});

	return { projects: query.data ?? NO_PROJECTS, organizationId };
}
