import { useMemo } from "react";
import { authClient } from "renderer/lib/auth-client";
import { cloudTrpc } from "renderer/lib/cloud-trpc";

export function useOrganizationPeople() {
	const { data: session } = authClient.useSession();
	const { data: members } =
		cloudTrpc.organization.listMembers.useQuery(undefined);
	const people = useMemo(
		() =>
			(members ?? []).map((member) => ({
				id: member.user.id,
				name: member.user.name,
				image: member.user.image,
			})),
		[members],
	);
	return { people, currentUserId: session?.user?.id ?? null };
}
