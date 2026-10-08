import { useLingui } from "@lingui/react/macro";
import type { ShareRoleOption } from "@superset/shared/sharing";

/** A page's share roles, weakest first. */
export function usePageShareRoles(): ShareRoleOption[] {
	const { t } = useLingui();
	return [
		{
			id: "view",
			label: t({ message: "Can view" }),
			description: t({ message: "Read the page" }),
		},
		{
			id: "comment",
			label: t({ message: "Can comment" }),
			description: t({ message: "Read the page and leave comments" }),
		},
	];
}
