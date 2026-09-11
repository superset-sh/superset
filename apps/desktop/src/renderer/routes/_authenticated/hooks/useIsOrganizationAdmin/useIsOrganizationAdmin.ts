import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * Whether the signed-in user is an admin or owner of this window's
 * organization; undefined until membership has loaded. Reads the window's org
 * the same way useIsOrganizationOwner does.
 */
export function useIsOrganizationAdmin(): boolean | undefined {
	const { data: session } = authClient.useSession();
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const currentUserId = session?.user?.id;
	if (!currentUserId || !members) return undefined;
	const role = members.find((member) => member.userId === currentUserId)?.role;
	return role === "admin" || role === "owner";
}
