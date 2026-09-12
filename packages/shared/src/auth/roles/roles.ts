import { msg } from "@lingui/core/macro";
import { i18n } from "../../i18n";

// Role hierarchy from lowest to highest permission
export const ROLE_HIERARCHY = ["member", "admin", "owner"] as const;

export type OrganizationRole = (typeof ROLE_HIERARCHY)[number];

export const ORGANIZATION_ROLES: Record<
	OrganizationRole,
	{ id: OrganizationRole; name: string }
> = {
	member: { id: "member", name: "Member" },
	admin: { id: "admin", name: "Admin" },
	owner: { id: "owner", name: "Owner" },
};

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

export function getRoleLevel(role: OrganizationRole): number {
	return ROLE_HIERARCHY.indexOf(role);
}

export function canModifyRole(
	actorRole: OrganizationRole,
	targetRole: OrganizationRole,
): boolean {
	return getRoleLevel(actorRole) >= getRoleLevel(targetRole);
}

export function getRoleSortPriority(role: OrganizationRole): number {
	// Invert for sorting: owner = 0, admin = 1, member = 2
	return ROLE_HIERARCHY.length - 1 - getRoleLevel(role);
}
