import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useIsOrganizationOwner } from "../useIsOrganizationOwner";
import { selectProjectDeletionHosts } from "./useProjectDeletionHosts.utils";

export function useProjectDeletionHosts(hostIds: string[]) {
	const { data: session } = authClient.useSession();
	const isOrganizationOwner = useIsOrganizationOwner();
	const { data: memberships } = cloudTrpc.host.listMembers.useQuery(undefined);
	return {
		isReady: !!session?.user?.id && memberships !== undefined,
		hostIds: selectProjectDeletionHosts({
			hostIds,
			userId: session?.user?.id,
			isOrganizationOwner,
			memberships: memberships ?? [],
		}),
	};
}
