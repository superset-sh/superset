import type { OrganizationRole } from "@superset/shared/auth";
import type {
	OrganizationPluginAccess,
	OrganizationPluginPolicy,
} from "@superset/shared/plugins";

export function withRoleAccess(
	policy: OrganizationPluginPolicy,
	role: OrganizationRole,
	access: OrganizationPluginAccess,
): OrganizationPluginPolicy {
	const next: OrganizationPluginPolicy = { ...policy };
	if (access === "unavailable") {
		delete next[role];
	} else {
		next[role] = access;
	}
	return next;
}
