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

test("hasAdminAccess keeps @superset.sh staff after the root domain changes", () => {
	const script = `
		const { hasAdminAccess } = await import("./admin-access.ts");
		console.log(JSON.stringify([
			hasAdminAccess({ email: "kiet@superset.sh", emailVerified: true }, "production"),
			hasAdminAccess({ email: "kiet@example.org", emailVerified: true }, "production"),
			hasAdminAccess({ email: "kiet@other.com", emailVerified: true }, "production"),
		]));
	`;
	const result = Bun.spawnSync(["bun", "-e", script], {
		cwd: import.meta.dir,
		env: { ...process.env, NEXT_PUBLIC_ROOT_DOMAIN: "example.org" },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	expect(JSON.parse(result.stdout.toString())).toEqual([true, true, false]);
});
