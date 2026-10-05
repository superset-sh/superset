import { describe, expect, test } from "bun:test";
import { selectProjectDeletionHosts } from "./useProjectDeletionHosts.utils";

const hostIds = ["personal", "shared", "someone-else"];
const memberships = [
	{ hostId: "personal", userId: "member", role: "owner" },
	{ hostId: "shared", userId: "member", role: "member" },
	{ hostId: "someone-else", userId: "other", role: "owner" },
	{ hostId: "unrelated", userId: "member", role: "owner" },
];

describe("project deletion devices", () => {
	test("members delete on devices they own", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: "member",
				isOrganizationOwner: false,
				memberships,
			}),
		).toEqual(["personal"]);
	});
	test("organization owners delete on every serving device", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: "owner",
				isOrganizationOwner: true,
				memberships,
			}),
		).toEqual(hostIds);
	});
	test("without a session nothing is deletable", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: undefined,
				isOrganizationOwner: true,
				memberships,
			}),
		).toEqual([]);
	});
});
