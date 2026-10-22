import { describe, expect, test } from "bun:test";
import { withRoleAccess } from "./withRoleAccess";

describe("withRoleAccess", () => {
	test("changes one role and keeps the others", () => {
		expect(
			withRoleAccess(
				{ owner: "available", admin: "available" },
				"member",
				"installed",
			),
		).toEqual({ owner: "available", admin: "available", member: "installed" });
	});

	test("unavailable drops the role from the policy", () => {
		expect(
			withRoleAccess(
				{ owner: "available", admin: "installed" },
				"admin",
				"unavailable",
			),
		).toEqual({ owner: "available" });
	});
});
