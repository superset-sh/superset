import { expect, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";

import { hasAdminAccess } from "./admin-access";

test("hasAdminAccess needs a verified company email outside local development", () => {
	const staff = { email: `kiet${COMPANY.EMAIL_DOMAIN}`, emailVerified: true };
	const unverified = {
		email: `anyone${COMPANY.EMAIL_DOMAIN}`,
		emailVerified: false,
	};
	expect(hasAdminAccess(staff, "production")).toBe(true);
	expect(hasAdminAccess(unverified, "production")).toBe(false);
	expect(hasAdminAccess(unverified, "development")).toBe(true);
	expect(
		hasAdminAccess(
			{ email: `x${COMPANY.EMAIL_DOMAIN}.evil.com`, emailVerified: true },
			"production",
		),
	).toBe(false);
});
