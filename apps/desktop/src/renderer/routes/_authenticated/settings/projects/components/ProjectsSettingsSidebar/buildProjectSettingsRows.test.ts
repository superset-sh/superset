import { describe, expect, it } from "bun:test";
import type { HostProjectGroup } from "renderer/hooks/host-projects/useHostProjectGroups/useHostProjectGroups.utils";
import {
	buildProjectSettingsRows,
	type ProjectSettingsRowInput,
} from "./buildProjectSettingsRows";

function makeProject(id: string, name: string): ProjectSettingsRowInput {
	return { id, name, iconUrl: null, color: null };
}

function makeGroup(
	id: string,
	name: string,
	members: Array<{ projectId: string; folder: string }>,
): HostProjectGroup {
	return {
		id,
		hostId: "machine-1",
		name,
		icon: null,
		color: null,
		createdAt: 1,
		updatedAt: 1,
		members: members.map((member, position) => ({
			id: `${id}-m${position}`,
			groupId: id,
			projectId: member.projectId,
			position,
			folder: member.folder,
			baseBranch: null,
		})),
	};
}

describe("a project over several source folders", () => {
	it("lists the project once, with its folders indented under it", () => {
		const rows = buildProjectSettingsRows(
			[
				makeProject("project-town", "town"),
				makeProject("project-roster", "roster"),
			],
			[
				makeGroup("group-samplee", "samplee", [
					{ projectId: "project-town", folder: "town" },
					{ projectId: "project-roster", folder: "roster" },
				]),
			],
		);

		expect(rows).toEqual([
			{
				id: "project-town",
				name: "samplee",
				iconUrl: null,
				color: null,
				kind: "project",
				groupId: "group-samplee",
				parentGroupId: null,
				depth: 0,
			},
			{
				id: "project-town",
				name: "town",
				iconUrl: null,
				color: null,
				kind: "folder",
				groupId: null,
				parentGroupId: "group-samplee",
				depth: 1,
			},
			{
				id: "project-roster",
				name: "roster",
				iconUrl: null,
				color: null,
				kind: "folder",
				groupId: null,
				parentGroupId: "group-samplee",
				depth: 1,
			},
		]);
	});

	it("still lists a source folder that is a project in its own right", () => {
		const rows = buildProjectSettingsRows(
			[
				makeProject("project-town", "town"),
				makeProject("project-roster", "roster"),
			],
			[
				makeGroup("group-samplee", "samplee", [
					{ projectId: "project-town", folder: "town" },
					{ projectId: "project-roster", folder: "roster" },
				]),
				makeGroup("group-roster", "roster", [
					{ projectId: "project-roster", folder: "roster" },
				]),
			],
		);

		expect(
			rows
				.filter((row) => row.depth === 0)
				.map((row) => [row.name, row.groupId]),
		).toEqual([
			["samplee", "group-samplee"],
			["roster", null],
		]);
	});
});

describe("a project over one source folder", () => {
	it("renders the single row it rendered before it had a container", () => {
		const rows = buildProjectSettingsRows(
			[makeProject("project-api", "api")],
			[
				makeGroup("group-api", "api", [
					{ projectId: "project-api", folder: "api" },
				]),
			],
		);

		expect(rows).toEqual([
			{
				id: "project-api",
				name: "api",
				iconUrl: null,
				color: null,
				kind: "project",
				groupId: null,
				parentGroupId: null,
				depth: 0,
			},
		]);
	});

	it("renders a project no host has grouped yet", () => {
		const rows = buildProjectSettingsRows(
			[makeProject("project-api", "api")],
			[],
		);

		expect(rows.map((row) => row.name)).toEqual(["api"]);
	});
});

describe("a repository that is the first folder of another project", () => {
	it("renders under the project that owns several folders, not its own", () => {
		const rows = buildProjectSettingsRows(
			[
				makeProject("project-roster", "roster"),
				makeProject("project-town", "town"),
			],
			[
				makeGroup("group-roster", "roster", [
					{ projectId: "project-roster", folder: "roster" },
				]),
				makeGroup("group-samplee", "samplee", [
					{ projectId: "project-roster", folder: "roster" },
					{ projectId: "project-town", folder: "town" },
				]),
			],
		);

		expect(rows.map((row) => [row.name, row.depth])).toEqual([
			["samplee", 0],
			["roster", 1],
			["town", 1],
		]);
	});
});
