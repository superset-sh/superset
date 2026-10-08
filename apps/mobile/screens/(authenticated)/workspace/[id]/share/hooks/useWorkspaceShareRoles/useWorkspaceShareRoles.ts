import { useLingui } from "@lingui/react/macro";
import type { ShareRoleOption } from "@superset/shared/sharing";

/** A cloud workspace has one share role until view and edit access exist. */
export function useWorkspaceShareRoles(): ShareRoleOption[] {
	const { t } = useLingui();
	return [
		{
			id: "full",
			label: t({ message: "Full access" }),
			description: t({ message: "Open terminals and prompt agents" }),
		},
	];
}
