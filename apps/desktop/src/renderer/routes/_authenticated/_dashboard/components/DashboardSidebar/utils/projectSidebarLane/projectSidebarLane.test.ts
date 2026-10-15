import { describe, expect, it } from "bun:test";
import { makeProject } from "../testProjectFixtures";
import {
	buildProjectSidebarLane,
	getStoredProjectLane,
	insertSectionInLane,
	mergeVisibleLane,
	moveProjectInLane,
	type ProjectSectionInput,
	type ProjectSidebarLaneItem,
	removeSectionFromLane,
	type StoredLaneEntry,
} from "./projectSidebarLane";

const projects = ["a", "b", "c", "d"].map((id) =>
	makeProject({ id, name: id.toUpperCase() }),
);
const section = (
	overrides: Partial<ProjectSectionInput> & { sectionId: string },
): ProjectSectionInput => ({
	name: "Section",
	color: null,
	isCollapsed: false,
	tabOrder: 0,
	...overrides,
});
const labels = (lane: ProjectSidebarLaneItem[]) =>
	lane.map((item) =>
		item.type === "section"
			? `[${item.section.id}]`
			: item.section
				? `${item.section.id}/${item.project.id}`
				: item.project.id,
	);
const stored = (lane: StoredLaneEntry[]) =>
	lane.map((entry) =>
		entry.type === "section"
			? `[${entry.id}]`
			: entry.sectionId
				? `${entry.sectionId}/${entry.id}`
				: entry.id,
	);

describe("buildProjectSidebarLane", () => {
	it("interleaves sections with top-level projects, each followed by its projects", () => {
		const lane = buildProjectSidebarLane({
			projects,
			sections: [section({ sectionId: "work", tabOrder: 2 })],
			placements: [
				{ projectId: "a", tabOrder: 1, sectionId: null },
				{ projectId: "b", tabOrder: 5, sectionId: "work" },
				{ projectId: "c", tabOrder: 3, sectionId: "work" },
				{ projectId: "d", tabOrder: 4, sectionId: null },
			],
		});
		expect(labels(lane)).toEqual(["a", "[work]", "work/c", "work/b", "d"]);
		const header = lane[1];
		expect(header?.type === "section" && header.section.projectCount).toBe(2);
	});

	it("puts a project whose section is gone at the top level", () => {
		const lane = buildProjectSidebarLane({
			projects: projects.slice(0, 1),
			sections: [],
			placements: [{ projectId: "a", tabOrder: 1, sectionId: "deleted" }],
		});
		expect(labels(lane)).toEqual(["a"]);
	});

	it("in a filtered view, drops empty sections and opens the rest", () => {
		const lane = buildProjectSidebarLane({
			projects: projects.slice(0, 1),
			sections: [
				section({ sectionId: "work", tabOrder: 1, isCollapsed: true }),
				section({ sectionId: "empty", tabOrder: 2 }),
			],
			placements: [{ projectId: "a", tabOrder: 3, sectionId: "work" }],
			hideEmptySections: true,
		});
		expect(labels(lane)).toEqual(["[work]", "work/a"]);
		const header = lane[0];
		expect(header?.type === "section" && header.section).toMatchObject({
			isCollapsed: false,
			isCollapseLocked: true,
		});
	});
});

describe("lane planning", () => {
	const lane = getStoredProjectLane(
		[
			{ projectId: "a", tabOrder: 1, sectionId: null },
			{ projectId: "b", tabOrder: 3, sectionId: "work" },
			{ projectId: "c", tabOrder: 4, sectionId: null },
		],
		[section({ sectionId: "work", tabOrder: 2 })],
	);

	it("reads the stored rows in render order", () => {
		expect(stored(lane)).toEqual(["a", "[work]", "work/b", "c"]);
	});

	it("moves a project to the end of a section, and out to just below it", () => {
		const moved = moveProjectInLane(lane, "a", "work");
		expect(stored(moved)).toEqual(["[work]", "work/b", "work/a", "c"]);
		expect(stored(moveProjectInLane(moved, "b", null))).toEqual([
			"[work]",
			"work/a",
			"b",
			"c",
		]);
	});

	it("opens a new section in place of the project it came from", () => {
		expect(stored(insertSectionInLane(lane, "new", "c"))).toEqual([
			"a",
			"[work]",
			"work/b",
			"[new]",
			"new/c",
		]);
		expect(stored(insertSectionInLane(lane, "new", "b"))).toEqual([
			"a",
			"[work]",
			"[new]",
			"new/b",
			"c",
		]);
	});

	it("a drag of the visible rows leaves hidden projects in their slots", () => {
		const visible = lane.filter((entry) => entry.id !== "b").reverse();
		expect(stored(mergeVisibleLane(lane, visible))).toEqual([
			"c",
			"[work]",
			"work/b",
			"a",
		]);
	});

	it("deleting a section leaves its projects in place at the top level", () => {
		expect(stored(removeSectionFromLane(lane, "work"))).toEqual([
			"a",
			"b",
			"c",
		]);
	});
});
