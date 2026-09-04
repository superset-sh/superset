import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

/**
 * Whether the signed-in user owns this window's organization. Reads
 * membership for the window's org, not the session's active organization —
 * the session holds one org for every window at once, and the member list is
 * scoped server-side by the organization header this window sends.
 */
export function useIsOrganizationOwner(): boolean {
	const { data: session } = authClient.useSession();
	const { data: members } = cloudTrpc.organization.listMembers.useQuery({
		includeDeactivated: false,
	});
	const currentUserId = session?.user?.id;
	return (
		members?.find((member) => member.userId === currentUserId)?.role === "owner"
	);
}
