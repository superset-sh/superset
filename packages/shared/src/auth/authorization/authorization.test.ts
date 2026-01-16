import { describe, expect, test } from "bun:test";
import { getAvailableRoleChanges } from "./authorization";

describe("getAvailableRoleChanges", () => {
	test("admin can change member to admin", () => {
		const roles = getAvailableRoleChanges("admin", "member", 2);
		expect(roles).toContain("admin");
		expect(roles).not.toContain("owner");
		expect(roles).not.toContain("member"); // current role excluded
	});

	test("admin can change admin to member", () => {
		const roles = getAvailableRoleChanges("admin", "admin", 2);
		expect(roles).toContain("member");
		expect(roles).not.toContain("owner");
		expect(roles).not.toContain("admin"); // current role excluded
	});

	test("admin cannot change owner", () => {
		const roles = getAvailableRoleChanges("admin", "owner", 2);
		expect(roles).toEqual([]);
	});

	test("owner can change member to admin or owner", () => {
		const roles = getAvailableRoleChanges("owner", "member", 2);
		expect(roles).toContain("admin");
		expect(roles).toContain("owner");
		expect(roles).not.toContain("member"); // current role excluded
	});

	test("owner can change admin to member or owner", () => {
		const roles = getAvailableRoleChanges("owner", "admin", 2);
		expect(roles).toContain("member");
		expect(roles).toContain("owner");
		expect(roles).not.toContain("admin"); // current role excluded
	});

	test("owner can change owner to admin or member (when multiple owners)", () => {
		const roles = getAvailableRoleChanges("owner", "owner", 3);
		expect(roles).toContain("admin");
		expect(roles).toContain("member");
		expect(roles).not.toContain("owner"); // current role excluded
	});

	test("owner cannot demote last owner", () => {
		const roles = getAvailableRoleChanges("owner", "owner", 1);
		expect(roles).toEqual([]); // no options - can't demote last owner
	});

	test("member cannot change any roles", () => {
		expect(getAvailableRoleChanges("member", "member", 2)).toEqual([]);
		expect(getAvailableRoleChanges("member", "admin", 2)).toEqual([]);
		expect(getAvailableRoleChanges("member", "owner", 2)).toEqual([]);
	});
});
