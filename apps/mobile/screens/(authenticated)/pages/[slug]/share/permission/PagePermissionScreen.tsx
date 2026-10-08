import { ShareRolePickerScreen } from "@/screens/(authenticated)/components/ShareAccess";
import { usePageShareRoles } from "../hooks/usePageShareRoles";

export function PagePermissionScreen() {
	return <ShareRolePickerScreen roles={usePageShareRoles()} />;
}
