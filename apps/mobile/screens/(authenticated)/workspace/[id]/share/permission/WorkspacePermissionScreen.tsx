import { ShareRolePickerScreen } from "@/screens/(authenticated)/components/ShareAccess";
import { useWorkspaceShareRoles } from "../hooks/useWorkspaceShareRoles";

export function WorkspacePermissionScreen() {
	return <ShareRolePickerScreen roles={useWorkspaceShareRoles()} />;
}
