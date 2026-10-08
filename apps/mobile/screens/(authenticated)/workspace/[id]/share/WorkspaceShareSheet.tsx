import { useLingui } from "@lingui/react/macro";
import { useLocalSearchParams, useRouter } from "expo-router";
import { workspaceShareUrl } from "@/lib/web-links";
import {
	granteeKey,
	ShareAccessSheet,
	useShareDirectory,
} from "@/screens/(authenticated)/components/ShareAccess";
import { useWorkspaceGeneralAccess } from "./hooks/useWorkspaceGeneralAccess";
import { useWorkspaceShareRoles } from "./hooks/useWorkspaceShareRoles";
import { useWorkspaceSharing } from "./hooks/useWorkspaceSharing";

export function WorkspaceShareSheet() {
	const { t } = useLingui();
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();
	const { sharing } = useWorkspaceSharing(id);
	const share = useShareDirectory();
	const roles = useWorkspaceShareRoles();
	const general = useWorkspaceGeneralAccess(id);

	return (
		<ShareAccessSheet
			linkUrl={id ? workspaceShareUrl(id) : null}
			owner={sharing.data?.owner ?? null}
			loaded={sharing.isSuccess}
			currentUserId={share.currentUserId}
			grantees={sharing.data?.grantees ?? []}
			canManage={sharing.data?.canManage ?? false}
			readOnlyNote={t({
				message: "Only the person who created this workspace can change these.",
			})}
			roles={roles}
			general={general}
			onInvite={() =>
				router.push({
					pathname: "/(authenticated)/workspace/[id]/share/invite",
					params: { id },
				})
			}
			onOpenGrantee={(grantee) =>
				router.push({
					pathname: "/(authenticated)/workspace/[id]/share/access",
					params: { id, grantee: granteeKey(grantee) },
				})
			}
			onOpenGeneral={() =>
				router.push({
					pathname: "/(authenticated)/workspace/[id]/share/general",
					params: { id },
				})
			}
		/>
	);
}
