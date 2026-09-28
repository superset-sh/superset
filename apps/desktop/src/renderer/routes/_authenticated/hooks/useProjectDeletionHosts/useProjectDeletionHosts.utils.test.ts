import { describe, expect, test } from "bun:test";
import { resolveProjectDeletionAccess } from "./useProjectDeletionHosts.utils";

const hostIds = ["personal", "shared", "someone-else", "unknown"];
const memberships = [
	{ hostId: "personal", userId: "member", role: "owner" },
	{ hostId: "shared", userId: "member", role: "member" },
	{ hostId: "someone-else", userId: "other", role: "owner" },
	{ hostId: "unrelated", userId: "member", role: "owner" },
];
const base = {
	projectId: "project",
	hostIds,
	creatorByHostId: {},
	userId: "member",
	isOrganizationOwner: false,
	memberships,
	workspaces: [],
};
const deletable = (access: ReturnType<typeof resolveProjectDeletionAccess>) =>
	access.filter((host) => host.canDelete).map((host) => host.hostId);

describe("project deletion devices", () => {
	test("members delete copies on devices they own", () => {
		expect(deletable(resolveProjectDeletionAccess(base))).toEqual(["personal"]);
	});
	test("organization owners delete across serving devices", () => {
		expect(
			deletable(
				resolveProjectDeletionAccess({ ...base, isOrganizationOwner: true }),
			),
		).toEqual(hostIds);
	});
	test("no session means no deletable devices", () => {
		expect(
			deletable(
				resolveProjectDeletionAccess({
					...base,
					userId: undefined,
					isOrganizationOwner: true,
				}),
			),
		).toEqual([]);
	});
	test("the creator deletes a copy only they are using", () => {
		const access = resolveProjectDeletionAccess({
			...base,
			creatorByHostId: { shared: "member" },
			workspaces: [
				{ projectId: "project", hostId: "shared", createdByUserId: "member" },
				{
					projectId: "project",
					hostId: "shared",
					createdByUserId: "other",
					archivedAt: 1,
				},
				{ projectId: "project", hostId: "personal", createdByUserId: "other" },
			],
		});
		expect(deletable(access)).toEqual(["personal", "shared"]);
	});
	test("another user's workspace blocks the creator but not an owner", () => {
		const access = resolveProjectDeletionAccess({
			...base,
			creatorByHostId: { shared: "member", personal: "member" },
			workspaces: [
				{ projectId: "project", hostId: "shared", createdByUserId: "other" },
				{ projectId: "project", hostId: "personal", createdByUserId: null },
			],
		});
		expect(access.find((host) => host.hostId === "shared")).toEqual({
			hostId: "shared",
			canDelete: false,
			inUseByOthers: true,
			otherUsersWorkspaceCount: 1,
		});
		expect(access.find((host) => host.hostId === "personal")).toEqual({
			hostId: "personal",
			canDelete: true,
			inUseByOthers: false,
			otherUsersWorkspaceCount: 1,
		});
	});
	test("a project with no recorded creator needs an owner", () => {
		expect(
			deletable(
				resolveProjectDeletionAccess({
					...base,
					hostIds: ["shared"],
					creatorByHostId: { shared: null },
				}),
			),
		).toEqual([]);
	});
});
