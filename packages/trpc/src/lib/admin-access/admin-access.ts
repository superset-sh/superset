import { COMPANY } from "@superset/shared/constants";

/**
 * Preview deployments allow email/password sign-up without verification, so
 * the domain alone proves nothing there. Local development skips the
 * verification step so test accounts can be created.
 */
export function hasAdminAccess(
	user: { email: string; emailVerified: boolean },
	nodeEnv = process.env.NODE_ENV,
): boolean {
	if (!user.email.endsWith(COMPANY.EMAIL_DOMAIN)) return false;
	return user.emailVerified || nodeEnv === "development";
}
