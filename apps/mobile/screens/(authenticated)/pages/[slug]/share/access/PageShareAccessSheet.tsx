import { useLocalSearchParams } from "expo-router";
import {
	findGrantee,
	granteeRefOf,
	ShareGranteeSheet,
} from "@/screens/(authenticated)/components/ShareAccess";
import { usePageQuery } from "../../../hooks/usePages";
import {
	type PageShareRole,
	usePageGranteesQuery,
	usePageShareMutations,
} from "../../hooks/usePageSharing";
import { usePageShareRoles } from "../hooks/usePageShareRoles";

export function PageShareAccessSheet() {
	const { slug, grantee: key } = useLocalSearchParams<{
		slug: string;
		grantee: string;
	}>();
	const page = usePageQuery(slug);
	const sharing = usePageGranteesQuery(page.data?.id);
	const mutations = usePageShareMutations(page.data?.id);
	const roles = usePageShareRoles();
	const grantees = sharing.data?.grantees ?? [];
	const grantee = findGrantee(grantees, key);
	const ref = grantee ? granteeRefOf(grantee) : undefined;

	return (
		<ShareGranteeSheet
			grantee={grantee}
			roles={roles}
			onSetRole={async (role) => {
				if (ref) {
					await mutations.setRole.mutateAsync({
						grantee: ref,
						role: role as PageShareRole,
					});
				}
			}}
			onRemove={async () => {
				if (ref) await mutations.remove.mutateAsync(ref);
			}}
		/>
	);
}
