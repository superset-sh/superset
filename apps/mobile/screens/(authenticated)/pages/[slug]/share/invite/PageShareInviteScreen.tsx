import { useLocalSearchParams, useRouter } from "expo-router";
import {
	ShareInviteScreen,
	useShareDirectory,
} from "@/screens/(authenticated)/components/ShareAccess";
import { usePageQuery } from "../../../hooks/usePages";
import {
	usePageGranteesQuery,
	usePageShareMutations,
} from "../../hooks/usePageSharing";
import { usePageShareRoles } from "../hooks/usePageShareRoles";

export function PageShareInviteScreen() {
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const page = usePageQuery(slug);
	const sharing = usePageGranteesQuery(page.data?.id);
	const mutations = usePageShareMutations(page.data?.id);
	const share = useShareDirectory();
	const roles = usePageShareRoles();

	return (
		<ShareInviteScreen
			directory={share.directory}
			grantees={sharing.data?.grantees ?? []}
			ownerId={page.data?.createdByUserId ?? null}
			organizationName={share.organizationName}
			inviteNew={share.inviteNew}
			roles={roles}
			defaultRole="comment"
			onUpgrade={share.onUpgrade}
			onOpenPermission={() =>
				router.push({
					pathname: "/(authenticated)/pages/[slug]/share/permission",
					params: { slug },
				})
			}
			onSubmit={(request) =>
				share.share(request, (grantees, role) =>
					mutations.add.mutateAsync({
						grantees,
						role: role === "view" ? "view" : "comment",
					}),
				)
			}
		/>
	);
}
