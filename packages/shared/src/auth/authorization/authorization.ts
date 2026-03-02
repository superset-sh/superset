import {
	canModifyRole,
	getRoleLevel,
	type OrganizationRole,
	ROLE_HIERARCHY,
} from "../roles";

/**
 * Get available roles that the target member can be changed to.
 *
 * Rules:
 * - Can only set roles up to your own level
 * - Can't change members above your level
 * - Protect last owner (can't demote if only 1 owner)
 *
 * @param actorRole - Role of the user performing the change
 * @param targetRole - Current role of the member being changed
 * @param ownerCount - Number of owners in the organization
 * @returns Array of roles the target can be changed to
 */
export function getAvailableRoleChanges(
	actorRole: OrganizationRole,
	targetRole: OrganizationRole,
	ownerCount: number,
): OrganizationRole[] {
	// Can't change members above your level
	if (!canModifyRole(actorRole, targetRole)) {
		return [];
	}

	const actorLevel = getRoleLevel(actorRole);
	const options: OrganizationRole[] = [];

	// Iterate in reverse order to show highest roles first (owner → admin → member)
	for (let i = ROLE_HIERARCHY.length - 1; i >= 0; i--) {
		const role = ROLE_HIERARCHY[i];
		if (!role) continue;

		const roleLevel = getRoleLevel(role);

		// Can only set roles up to your own level
		if (roleLevel > actorLevel) {
			continue;
		}

		// Protect last owner - can't demote if only 1 owner
		if (targetRole === "owner" && ownerCount === 1 && role !== "owner") {
			continue;
		}

		// Don't show current role as an option
		if (role === targetRole) {
			continue;
		}

		options.push(role);
	}

	return options;
}

/**
 * Check if an actor can remove a target member from the organization.
 *
 * Rules:
 * - Can't remove yourself
 * - Can't remove members above your level
 * - Can't remove the last owner (prevents orphaned organization)
 *
 * @param actorRole - Role of the user performing the removal
 * @param targetRole - Role of the member being removed
 * @param isTargetSelf - Whether the target is the actor themselves
 * @param ownerCount - Number of owners in the organization
 * @returns Whether the actor can remove the target
 */
export function canRemoveMember(
	actorRole: OrganizationRole,
	targetRole: OrganizationRole,
	isTargetSelf: boolean,
	ownerCount: number,
): boolean {
	// Can't remove yourself
	if (isTargetSelf) {
		return false;
	}

	// Can't remove members above your level
	if (!canModifyRole(actorRole, targetRole)) {
		return false;
	}

	// Can't remove the last owner
	if (targetRole === "owner" && ownerCount === 1) {
		return false;
	}

	return true;
}

/**
 * Get roles that an actor can invite new users as.
 *
 * Rules:
 * - Members cannot invite anyone
 * - Admins and owners can invite roles up to their own level
 *
 * @param actorRole - Role of the user performing the invitation
 * @returns Array of roles the actor can invite
 */
export function getInvitableRoles(
	actorRole: OrganizationRole,
): OrganizationRole[] {
	if (actorRole === "member") return [];

	const actorLevel = getRoleLevel(actorRole);
	return ROLE_HIERARCHY.filter((role) => getRoleLevel(role) <= actorLevel);
}

/**
 * Check if an actor can invite a user with a specific role.
 *
 * @param actorRole - Role of the user performing the invitation
 * @param inviteRole - Role to invite the new user as
 * @returns Whether the actor can invite with this role
 */
export function canInvite(
	actorRole: OrganizationRole,
	inviteRole: OrganizationRole,
): boolean {
	return getInvitableRoles(actorRole).includes(inviteRole);
}
