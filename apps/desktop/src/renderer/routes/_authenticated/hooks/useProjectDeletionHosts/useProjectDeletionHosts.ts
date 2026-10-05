import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { selectProjectDeletionHosts } from "./useProjectDeletionHosts.utils";

export function useProjectDeletionHosts(hostIds: string[]) {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;
	const { data: organizationMembers } =
		cloudTrpc.organization.listMembers.useQuery({ includeDeactivated: false });
	const { data: memberships } = cloudTrpc.host.listMembers.useQuery(undefined);
	return {
		userId,
		organizationMembers: organizationMembers ?? [],
		isReady:
			!!userId &&
			organizationMembers !== undefined &&
			memberships !== undefined,
		hostIds: selectProjectDeletionHosts({
			hostIds,
			userId,
			isOrganizationOwner:
				organizationMembers?.find((member) => member.userId === userId)
					?.role === "owner",
			memberships: memberships ?? [],
		}),
	};
}
