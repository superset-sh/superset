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
