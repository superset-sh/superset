import { expect, test } from "bun:test";

import { hasAdminAccess } from "./admin-access";

test("hasAdminAccess needs a verified company email outside local development", () => {
	const staff = { email: "kiet@superset.sh", emailVerified: true };
	const unverified = { email: "anyone@superset.sh", emailVerified: false };
	expect(hasAdminAccess(staff, "production")).toBe(true);
	expect(hasAdminAccess(unverified, "production")).toBe(false);
	expect(hasAdminAccess(unverified, "development")).toBe(true);
	expect(
		hasAdminAccess(
			{ email: "x@superset.sh.evil.com", emailVerified: true },
			"production",
		),
	).toBe(false);
});
