import { describe, expect, test } from "bun:test";
import { requireOrganizationMemberToken } from "./organization-membership";

describe("host-service organization membership authorization", () => {
	test("rejects requests without a stored token", () => {
		expect(() =>
			requireOrganizationMemberToken(
				{ token: null, organizationIds: ["org-1"] },
				"org-1",
			),
		).toThrow(expect.objectContaining({ code: "UNAUTHORIZED" }));
	});

	test("rejects organizations outside authenticated membership", () => {
		expect(() =>
			requireOrganizationMemberToken(
				{ token: "token", organizationIds: ["org-1"] },
				"org-2",
			),
		).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
	});

	test("returns the token for a current organization member", () => {
		expect(
			requireOrganizationMemberToken(
				{ token: "token", organizationIds: ["org-1"] },
				"org-1",
			),
		).toBe("token");
	});
});
