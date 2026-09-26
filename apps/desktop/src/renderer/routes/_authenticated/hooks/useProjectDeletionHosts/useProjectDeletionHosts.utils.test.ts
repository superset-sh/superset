import { describe, expect, test } from "bun:test";
import { selectProjectDeletionHosts } from "./useProjectDeletionHosts.utils";

const hostIds = ["personal", "shared", "someone-else", "unknown"];
const memberships = [
	{ hostId: "personal", userId: "member", role: "owner" },
	{ hostId: "shared", userId: "member", role: "member" },
	{ hostId: "someone-else", userId: "other", role: "owner" },
	{ hostId: "unrelated", userId: "member", role: "owner" },
];

describe("project deletion devices", () => {
	test("members only delete replicas on devices they own", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: "member",
				isOrganizationOwner: false,
				memberships,
			}),
		).toEqual(["personal"]);
	});
	test("organization owners retain deletion across serving devices", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: "owner",
				isOrganizationOwner: true,
				memberships,
			}),
		).toEqual(hostIds);
	});
	test("missing membership data does not grant a member deletion", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: "member",
				isOrganizationOwner: false,
				memberships: [],
			}),
		).toEqual([]);
	});
	test("missing session does not grant deletion", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds,
				userId: undefined,
				isOrganizationOwner: true,
				memberships,
			}),
		).toEqual([]);
	});
	test("no serving devices never falls back to the local device", () => {
		expect(
			selectProjectDeletionHosts({
				hostIds: [],
				userId: "member",
				isOrganizationOwner: false,
				memberships,
			}),
		).toEqual([]);
	});
});
