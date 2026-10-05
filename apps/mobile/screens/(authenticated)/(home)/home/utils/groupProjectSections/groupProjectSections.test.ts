import { describe, expect, test } from "bun:test";
import type { ProjectCollectionSummary } from "@superset/shared/project-collections";
import { groupProjectSections } from "./groupProjectSections";

const collection = (tag: string): ProjectCollectionSummary => ({
	tag,
	name: tag,
	color: null,
	tabOrder: 0,
});

const shape = (groups: ReturnType<typeof groupProjectSections>) =>
	groups.map((group) =>
		group.kind === "project"
			? group.section.projectId
			: `${group.collection.tag}[${group.sections
					.map((section) => section.projectId)
					.join(",")}]`,
	);

describe("groupProjectSections", () => {
	test("counts collection members without a visible workspace section", () => {
		const team = collection("team");
		const groups = groupProjectSections(
			[{ projectId: "active" }],
			new Map([
				["active", team],
				["empty-a", team],
				["empty-b", team],
				["elsewhere", collection("other")],
			]),
		);
		const group = groups[0];
		expect(group?.kind).toBe("collection");
		if (group?.kind !== "collection") throw new Error("Collection missing");
		expect(group.projectCount).toBe(3);
		expect(group.sections).toEqual([{ projectId: "active" }]);
	});
	test("a collection takes the place of its first project", () => {
		const team = collection("team");
		const groups = groupProjectSections(
			[
				{ projectId: "loose" },
				{ projectId: "b" },
				{ projectId: "other" },
				{ projectId: "a" },
				{ projectId: "__none" },
			],
			new Map([
				["a", team],
				["b", team],
			]),
		);
		expect(shape(groups)).toEqual(["loose", "team[b,a]", "other", "__none"]);
	});

	test("keeps separate collections apart, each at its first project", () => {
		const groups = groupProjectSections(
			[
				{ projectId: "x1" },
				{ projectId: "y1" },
				{ projectId: "x2" },
				{ projectId: "y2" },
			],
			new Map([
				["x1", collection("x")],
				["x2", collection("x")],
				["y1", collection("y")],
				["y2", collection("y")],
			]),
		);
		expect(shape(groups)).toEqual(["x[x1,x2]", "y[y1,y2]"]);
	});

	test("leaves every section in place when nothing is collected", () => {
		const groups = groupProjectSections(
			[{ projectId: "a" }, { projectId: "b" }],
			new Map(),
		);
		expect(shape(groups)).toEqual(["a", "b"]);
	});
});
