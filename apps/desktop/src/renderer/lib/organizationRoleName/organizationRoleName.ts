import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { OrganizationRole } from "@superset/shared/auth";

/**
 * The role's display name in the active locale. It lives here rather than
 * beside the role data in `@superset/shared`: that module reaches the auth
 * server, and a script running it uncompiled (`db:seed-dev`) has no macro
 * transform, so the macro's runtime entry throws on import.
 */
export function organizationRoleName(role: OrganizationRole): string {
	switch (role) {
		case "owner":
			return i18n._(msg({ message: "Owner" }));
		case "admin":
			return i18n._(msg({ message: "Admin" }));
		default:
			return i18n._(msg({ message: "Member" }));
	}
}
