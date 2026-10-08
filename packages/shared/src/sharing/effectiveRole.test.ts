import { describe, expect, test } from "bun:test";
import { effectiveRole } from "./effectiveRole";
import type { ShareGrantee, ShareRoleOption } from "./types";

const roles: ShareRoleOption[] = [
	{ id: "view", label: "Can view", description: "" },
	{ id: "comment", label: "Can comment", description: "" },
];
const teams = [{ teamId: "design", name: "Design", memberIds: ["do"] }];
const designShare: ShareGrantee = {
	kind: "team",
	teamId: "design",
	name: "Design",
	memberCount: 1,
	role: "comment",
};

describe("effectiveRole", () => {
	test("a team share that outranks a person's own role is reported", () => {
		expect(
			effectiveRole({
				userId: "do",
				ownRole: "view",
				grantees: [designShare],
				teams,
				roles,
				general: null,
			}),
		).toEqual({ role: "comment", via: "Design" });
	});

	test("general access counts too", () => {
		expect(
			effectiveRole({
				userId: "kt",
				ownRole: "view",
				grantees: [],
				teams,
				roles,
				general: { role: "comment", label: "Anyone in your organization" },
			}),
		).toEqual({ role: "comment", via: "Anyone in your organization" });
	});

	test("nothing is reported when the person's own role is already the strongest", () => {
		expect(
			effectiveRole({
				userId: "do",
				ownRole: "comment",
				grantees: [designShare],
				teams,
				roles,
				general: null,
			}),
		).toBeNull();
	});

	test("a team someone isn't in gives them nothing", () => {
		expect(
			effectiveRole({
				userId: "kt",
				ownRole: "view",
				grantees: [designShare],
				teams,
				roles,
				general: null,
			}),
		).toBeNull();
	});
});
