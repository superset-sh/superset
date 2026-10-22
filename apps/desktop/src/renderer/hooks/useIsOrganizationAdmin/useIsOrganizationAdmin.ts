import { getRoleLevel, type OrganizationRole } from "@superset/shared/auth";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/** undefined while the membership is loading. */
export function useIsOrganizationAdmin(): boolean | undefined {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;
	const { data: members } = cloudTrpc.organization.listMembers.useQuery(
		undefined,
		{ enabled: Boolean(userId) },
	);
	if (!members || !userId) return undefined;
	const role = members.find((member) => member.userId === userId)?.role;
	if (!role) return false;
	return getRoleLevel(role as OrganizationRole) >= getRoleLevel("admin");
}
