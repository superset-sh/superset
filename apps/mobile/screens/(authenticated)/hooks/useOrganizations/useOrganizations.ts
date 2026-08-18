import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { authClient } from "@/lib/auth/client";
import { apiClient } from "@/lib/trpc/client";

export function useOrganizations() {
	const router = useRouter();

	const session = authClient.useSession();
	const activeOrganizationId = session.data?.session?.activeOrganizationId;

	const { data: organizations } = useQuery({
		queryKey: ["cloud", "user", "myOrganizations"],
		queryFn: () => apiClient.user.myOrganizations.query(),
		staleTime: 30_000,
	});

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
