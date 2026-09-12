import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { OrganizationRole } from "@superset/shared/auth";

/**
 * The role's display name in the active locale. `ORGANIZATION_ROLES[x].name`
 * stays plain English: it is stable data (logs, server payloads), so display
 * code renders this instead.
 */
export function organizationRoleName(role: OrganizationRole): string {
	switch (role) {
		case "owner":
			return i18n._(msg({ message: "Owner" }));
		case "admin":
			return i18n._(msg({ message: "Admin" }));
		case "member":
			return i18n._(msg({ message: "Member" }));
	}
}
