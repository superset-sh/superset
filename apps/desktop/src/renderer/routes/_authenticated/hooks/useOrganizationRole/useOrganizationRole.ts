import type { OrganizationRole } from "@superset/shared/auth";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * The signed-in user's role in this window's organization. Reads membership
 * for the window's org, not the session's active organization — the session
 * holds one org for every window at once, and the member list is scoped
 * server-side by the organization header this window sends.
 */
export function useOrganizationRole(): OrganizationRole | null {
	const { data: session } = authClient.useSession();
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const currentUserId = session?.user?.id;
	const role = members?.find((member) => member.userId === currentUserId)?.role;
	return (role as OrganizationRole | undefined) ?? null;
}
