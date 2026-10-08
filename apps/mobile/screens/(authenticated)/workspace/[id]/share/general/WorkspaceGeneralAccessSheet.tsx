import { useLocalSearchParams } from "expo-router";
import { ShareGeneralAccessSheet } from "@/screens/(authenticated)/components/ShareAccess";
import { useWorkspaceGeneralAccess } from "../hooks/useWorkspaceGeneralAccess";
import { useWorkspaceShareRoles } from "../hooks/useWorkspaceShareRoles";

export function WorkspaceGeneralAccessSheet() {
	const { id } = useLocalSearchParams<{ id: string }>();
	return (
		<ShareGeneralAccessSheet
			mode="who"
			general={useWorkspaceGeneralAccess(id)}
			roles={useWorkspaceShareRoles()}
		/>
	);
}
