import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
	granteeKey,
	ShareAccessSheet,
	useShareDirectory,
} from "@/screens/(authenticated)/components/ShareAccess";
import { usePageQuery } from "../../hooks/usePages";
import {
	usePageAccessQuery,
	usePageGranteesQuery,
	usePageSharingActions,
	usePageVersionsQuery,
} from "../hooks/usePageSharing";
import { SharedVersionRow } from "./components/SharedVersionRow";
import { usePageGeneralAccess } from "./hooks/usePageGeneralAccess";
import { usePageShareRoles } from "./hooks/usePageShareRoles";

export function PageShareSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { slug } = useLocalSearchParams<{ slug: string }>();
	const page = usePageQuery(slug);
	const access = usePageAccessQuery(slug);
	const versions = usePageVersionsQuery(slug);
	const { setSharedVersion } = usePageSharingActions(page.data?.id);
	const sharing = usePageGranteesQuery(page.data?.id);
	const share = useShareDirectory();
	const roles = usePageShareRoles();
	const general = usePageGeneralAccess(slug);

	const owner = access.data?.owner;
	const canManage =
		page.data !== undefined &&
		share.currentUserId !== undefined &&
		page.data.createdByUserId === share.currentUserId;

	return (
		<ShareAccessSheet
			linkUrl={page.data?.url ?? null}
			owner={owner ? { ...owner, userId: owner.id } : null}
			loaded={access.isSuccess}
			currentUserId={share.currentUserId}
			grantees={sharing.data?.grantees ?? []}
			canManage={canManage}
			readOnlyNote={t({
				message: "Only the person who created this page can change these.",
			})}
			roles={roles}
			general={general}
			extra={
				<SharedVersionRow
					sharedVersion={page.data?.sharedVersion ?? null}
					latestVersion={page.data?.latestVersion ?? null}
					versions={versions.data ?? []}
					canManage={canManage}
					onChange={(version) => setSharedVersion.mutate(version)}
				/>
			}
			onInvite={() =>
				router.push({
					pathname: "/(authenticated)/pages/[slug]/share/invite",
					params: { slug },
				})
			}
			onOpenGrantee={(grantee) =>
				router.push({
					pathname: "/(authenticated)/pages/[slug]/share/access",
					params: { slug, grantee: granteeKey(grantee) },
				})
			}
			onOpenGeneral={(mode) =>
				router.push({
					pathname: "/(authenticated)/pages/[slug]/share/general",
					params: { slug, mode },
				})
			}
		/>
	);
}
