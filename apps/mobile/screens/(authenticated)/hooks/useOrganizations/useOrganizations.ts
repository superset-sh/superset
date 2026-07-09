import { useLiveQuery } from "@tanstack/react-db";
import { useRouter } from "expo-router";
import { authClient } from "@/lib/auth/client";
import { useCollections } from "@/screens/(authenticated)/providers/CollectionsProvider";

export function useOrganizations() {
	const router = useRouter();
	const collections = useCollections();

	const session = authClient.useSession();
	const activeOrganizationId = session.data?.session?.activeOrganizationId;

	const { data: organizations } = useLiveQuery(
		(q) => q.from({ organizations: collections.organizations }),
		[collections],
	);

	const activeOrganization = organizations?.find(
		(org) => org.id === activeOrganizationId,
	);

	const switchOrganization = async (organizationId: string) => {
		if (organizationId === activeOrganizationId) return;
		try {
			await authClient.organization.setActive({ organizationId });
			router.replace("/(authenticated)/(home)");
		} catch (error) {
			console.error(
				"[organization/switch] Failed to switch organization:",
				error,
			);
		}
	};

	return {
		organizations: organizations ?? [],
		activeOrganization,
		activeOrganizationId,
		switchOrganization,
	};
}
