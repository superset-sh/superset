import { describe, expect, it } from "bun:test";
import {
	getProjectTopLevelItems,
	groupPlanByHost,
	type PlannerData,
	planSectionMembersOrder,
	planTopLevelOrder,
	planUngroupWorkspaces,
} from "./sectionHostMutations";

function ws(
	id: string,
	overrides: Partial<PlannerData["workspaces"][number]> = {},
) {
	return {
		id,
		projectId: "proj-1",
		hostId: "host-1",
		sectionId: null,
		tabOrder: 0,
		...overrides,
	};
}

function sec(
	id: string,
	overrides: Partial<PlannerData["sections"][number]> = {},
) {
	return {
		id,
		projectId: "proj-1",
		hostId: "host-1",
		tabOrder: 0,
		...overrides,
	};
}

describe("getProjectTopLevelItems", () => {
	it("interleaves ungrouped workspaces and sections, sections-first on ties", () => {
		const data: PlannerData = {
			workspaces: [
				ws("w1", { tabOrder: 1 }),
				ws("w2", { tabOrder: 2 }),
				ws("grouped", { tabOrder: 1, sectionId: "s1" }),
			],
			sections: [sec("s1", { tabOrder: 2 })],
		};
		expect(
			getProjectTopLevelItems(data, "proj-1").map((item) => item.id),
		).toEqual(["w1", "s1", "w2"]);
	});
});

describe("planTopLevelOrder", () => {
	it("writes only rows whose placement changed, with absolute merged-lane orders", () => {
		const data: PlannerData = {
			workspaces: [
				ws("w1", { tabOrder: 1 }),
				ws("w2", { tabOrder: 5, hostId: "host-2" }),
			],
			sections: [sec("s1", { tabOrder: 2 })],
		};
		const plan = planTopLevelOrder(data, [
			{ type: "workspace", id: "w1" },
			{ type: "section", id: "s1" },
			{ type: "workspace", id: "w2" },
		]);
		// w1 already at position 1 and ungrouped, s1 already at 2 → only w2 moves.
		expect(plan.sectionWrites).toEqual([]);
		expect(plan.workspaceWrites).toEqual([
			{ hostId: "host-2", workspaceId: "w2", sectionId: null, tabOrder: 3 },
		]);
	});

	it("un-groups a workspace placed in the top-level lane", () => {
		const data: PlannerData = {
			workspaces: [ws("w1", { tabOrder: 1, sectionId: "s1" })],
			sections: [sec("s1", { tabOrder: 1 })],
		};
		const plan = planTopLevelOrder(data, [{ type: "workspace", id: "w1" }]);
		expect(plan.workspaceWrites).toEqual([
			{ hostId: "host-1", workspaceId: "w1", sectionId: null, tabOrder: 1 },
		]);
	});
});

describe("planSectionMembersOrder", () => {
	it("assigns membership and absolute within-section orders", () => {
		const data: PlannerData = {
			workspaces: [
				ws("w1", { sectionId: "s1", tabOrder: 1 }),
				ws("w2", { sectionId: null, tabOrder: 4, hostId: "host-2" }),
			],
			sections: [sec("s1", { tabOrder: 3 })],
		};
		const plan = planSectionMembersOrder(data, "s1", ["w2", "w1"]);
		expect(plan.workspaceWrites).toEqual([
			{ hostId: "host-2", workspaceId: "w2", sectionId: "s1", tabOrder: 1 },
			{ hostId: "host-1", workspaceId: "w1", sectionId: "s1", tabOrder: 2 },
		]);
	});
});

describe("planUngroupWorkspaces", () => {
	it("lands members above the first section and renumbers the lane", () => {
		const data: PlannerData = {
			workspaces: [
				ws("loose", { tabOrder: 1 }),
				ws("member", { sectionId: "dead", tabOrder: 1 }),
			],
			sections: [sec("dead", { tabOrder: 2 }), sec("keep", { tabOrder: 3 })],
		};
		const plan = planUngroupWorkspaces(data, "proj-1", ["member"], {
			excludeSectionId: "dead",
		});
		// Lane becomes: loose (1), member (2), keep (3) — loose/keep unchanged.
		expect(plan.workspaceWrites).toEqual([
			{ hostId: "host-1", workspaceId: "member", sectionId: null, tabOrder: 2 },
		]);
		expect(plan.sectionWrites).toEqual([]);
	});
});

describe("groupPlanByHost", () => {
	it("splits writes per owning host", () => {
		const plan = {
			sectionWrites: [{ hostId: "host-1", sectionId: "s1", tabOrder: 1 }],
			workspaceWrites: [
				{
					hostId: "host-2",
					workspaceId: "w1",
					sectionId: null,
					tabOrder: 2,
				},
			],
		};
		const byHost = groupPlanByHost(plan);
		expect([...byHost.keys()].sort()).toEqual(["host-1", "host-2"]);
		expect(byHost.get("host-1")?.workspaceWrites).toEqual([]);
		expect(byHost.get("host-2")?.workspaceWrites).toHaveLength(1);
	});
});
