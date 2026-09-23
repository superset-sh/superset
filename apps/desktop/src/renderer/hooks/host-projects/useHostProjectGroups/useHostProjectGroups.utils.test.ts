import { describe, expect, test } from "bun:test";
import {
	collectSourceFolderOnlyProjectIds,
	findProjectGroupForProject,
	type HostProjectGroup,
	indexProjectGroupsByPrimaryProjectId,
} from "./useHostProjectGroups.utils";

function makeGroup(
	id: string,
	name: string,
	memberProjectIds: string[],
): HostProjectGroup {
	return {
		id,
		hostId: "host-1",
		name,
		icon: null,
		color: null,
		createdAt: 1,
		updatedAt: 1,
		members: memberProjectIds.map((projectId, position) => ({
			id: `${id}-m${position}`,
			groupId: id,
			projectId,
			position,
			folder: projectId,
			baseBranch: null,
		})),
	};
}

const BACKFILLED = makeGroup("group-api", "api", ["project-api"]);
const MULTI = makeGroup("group-platform", "Platform", [
	"project-api",
	"project-web",
]);

describe("the project a repository is the primary of", () => {
	test("is the one that owns several source folders", () => {
		const index = indexProjectGroupsByPrimaryProjectId([BACKFILLED, MULTI]);

		expect(index.get("project-api")).toBe(MULTI);
		expect(index.get("project-web")).toBeUndefined();
	});

	test("is the first group listed when two claim it with equal standing", () => {
		const other = makeGroup("group-other", "Other", ["project-api"]);
		const index = indexProjectGroupsByPrimaryProjectId([BACKFILLED, other]);

		expect(index.get("project-api")).toBe(BACKFILLED);
	});
});

describe("a repository that is only someone's source folder", () => {
	test("is collected so nothing lists it as a project of its own", () => {
		expect(collectSourceFolderOnlyProjectIds([MULTI])).toEqual(
			new Set(["project-web"]),
		);
	});

	test("is not collected once it is the primary of some project", () => {
		expect(collectSourceFolderOnlyProjectIds([BACKFILLED, MULTI])).toEqual(
			new Set(["project-web"]),
		);
		expect(
			collectSourceFolderOnlyProjectIds([
				MULTI,
				makeGroup("group-web", "web", ["project-web"]),
			]),
		).toEqual(new Set());
	});
});

describe("the project a settings page belongs to", () => {
	test("prefers the one the repository is primary of", () => {
		const borrowing = makeGroup("group-tools", "Tools", [
			"project-web",
			"project-api",
		]);

		expect(
			findProjectGroupForProject([borrowing, BACKFILLED], "project-api"),
		).toBe(BACKFILLED);
	});

	test("falls back to one that merely contains the repository", () => {
		expect(findProjectGroupForProject([MULTI], "project-web")).toBe(MULTI);
	});

	test("is null for a repository no project has picked up yet", () => {
		expect(findProjectGroupForProject([MULTI], "project-new")).toBeNull();
	});
});
