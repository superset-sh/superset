import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { resolveProjectDeletionAccess } from "./useProjectDeletionHosts.utils";

export function useProjectDeletionHosts({
	projectId,
	hostIds,
	creatorByHostId,
}: {
	projectId: string;
	hostIds: string[];
	creatorByHostId: Record<string, string | null>;
}) {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;
	const { data: organizationMembers } =
		cloudTrpc.organization.listMembers.useQuery({ includeDeactivated: false });
	const { data: memberships } = cloudTrpc.host.listMembers.useQuery(undefined);
	const { workspaces } = useHostWorkspaces();
	const access = resolveProjectDeletionAccess({
		projectId,
		hostIds,
		creatorByHostId,
		userId,
		isOrganizationOwner:
			organizationMembers?.find((member) => member.userId === userId)?.role ===
			"owner",
		memberships: memberships ?? [],
		workspaces,
	});
	return {
		isReady:
			!!userId &&
			organizationMembers !== undefined &&
			memberships !== undefined,
		access,
		hostIds: access.filter((host) => host.canDelete).map((host) => host.hostId),
	};
}
