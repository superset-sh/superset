import { useLocalSearchParams } from "expo-router";
import {
	findGrantee,
	granteeRefOf,
	ShareGranteeSheet,
} from "@/screens/(authenticated)/components/ShareAccess";
import { useWorkspaceShareRoles } from "../hooks/useWorkspaceShareRoles";
import { useWorkspaceSharing } from "../hooks/useWorkspaceSharing";

export function WorkspaceShareAccessSheet() {
	const { id, grantee: key } = useLocalSearchParams<{
		id: string;
		grantee: string;
	}>();
	const { sharing, remove } = useWorkspaceSharing(id);
	const grantee = findGrantee(sharing.data?.grantees ?? [], key);

	return (
		<ShareGranteeSheet
			grantee={grantee}
			roles={useWorkspaceShareRoles()}
			onRemove={async () => {
				if (grantee) await remove.mutateAsync(granteeRefOf(grantee));
			}}
		/>
	);
}
