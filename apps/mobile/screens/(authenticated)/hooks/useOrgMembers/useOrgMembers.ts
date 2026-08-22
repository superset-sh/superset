import type { RouterOutputs } from "@superset/trpc";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export type OrgMember = RouterOutputs["organization"]["listMembers"][number];

const NO_MEMBERS: OrgMember[] = [];

/** Members of the active organization, each with their user profile. */
export function useOrgMembers(): OrgMember[] {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;

	const query = useQuery({
		queryKey: ["cloud", "organization", "listMembers", organizationId],
		enabled: organizationId !== null,
		queryFn: () => apiClient.organization.listMembers.query(),
		staleTime: 30_000,
	});

	return query.data ?? NO_MEMBERS;
}
