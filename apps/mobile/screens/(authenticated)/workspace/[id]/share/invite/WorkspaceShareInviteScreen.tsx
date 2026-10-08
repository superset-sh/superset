import { useLocalSearchParams, useRouter } from "expo-router";
import {
	ShareInviteScreen,
	useShareDirectory,
} from "@/screens/(authenticated)/components/ShareAccess";
import { useWorkspaceShareRoles } from "../hooks/useWorkspaceShareRoles";
import { useWorkspaceSharing } from "../hooks/useWorkspaceSharing";

export function WorkspaceShareInviteScreen() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id: string }>();
	const { sharing, add } = useWorkspaceSharing(id);
	const share = useShareDirectory();
	const roles = useWorkspaceShareRoles();

	return (
		<ShareInviteScreen
			directory={share.directory}
			grantees={sharing.data?.grantees ?? []}
			ownerId={sharing.data?.owner?.userId ?? null}
			organizationName={share.organizationName}
			inviteNew={share.inviteNew}
			roles={roles}
			defaultRole="full"
			onUpgrade={share.onUpgrade}
			onOpenPermission={() =>
				router.push({
					pathname: "/(authenticated)/workspace/[id]/share/permission",
					params: { id },
				})
			}
			onSubmit={(request) =>
				share.share(request, (grantees) => add.mutateAsync(grantees))
			}
		/>
	);
}
