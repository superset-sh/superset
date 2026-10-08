import {
	useGeneralAccess,
	useShareDirectory,
} from "@/screens/(authenticated)/components/ShareAccess";
import { usePageQuery } from "../../../../hooks/usePages";
import {
	type PageShareRole,
	usePageGranteesQuery,
	usePageShareMutations,
	usePageSharingActions,
} from "../../../hooks/usePageSharing";

/** Who can open a page from its link, and what they can do there. */
export function usePageGeneralAccess(slug: string) {
	const page = usePageQuery(slug);
	const sharing = usePageGranteesQuery(page.data?.id);
	const mutations = usePageShareMutations(page.data?.id);
	const { setVisibility } = usePageSharingActions(page.data?.id);
	const share = useShareDirectory();
	return useGeneralAccess({
		value: page.data?.visibility ?? "just_me",
		values: ["just_me", "org", "everyone"],
		organizationName: share.organizationName,
		onChange: (next) => setVisibility.mutateAsync(next),
		role: {
			value: sharing.data?.orgRole ?? "comment",
			onChange: (role) =>
				mutations.setOrgRole.mutateAsync(role as PageShareRole),
		},
	});
}
