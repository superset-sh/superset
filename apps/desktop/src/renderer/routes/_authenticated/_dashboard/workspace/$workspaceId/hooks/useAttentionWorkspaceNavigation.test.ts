import { describe, expect, test } from "bun:test";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import type { Tab } from "renderer/stores/tabs/types";
import type { Pane } from "shared/tabs-types";
import {
	computeAttentionWorkspaceIds,
	indexGrouped,
} from "./useAttentionWorkspaceNavigation";

type GroupedWorkspaces = ElectronRouterOutputs["workspaces"]["getAllGrouped"];
type Group = GroupedWorkspaces[number];
type GroupWorkspace = Group["workspaces"][number];
type GroupSection = Group["sections"][number];
type TopLevelItem = Group["topLevelItems"][number];

function makeWorkspace(
	id: string,
	overrides: Partial<GroupWorkspace> = {},
): GroupWorkspace {
	return {
		id,
		projectId: "p1",
		sectionId: null,
		worktreeId: null,
		worktreePath: "",
		type: "branch",
		branch: id,
		name: id,
		tabOrder: 0,
		createdAt: 0,
		updatedAt: 0,
		lastOpenedAt: 0,
		isUnread: false,
		isUnnamed: false,
		createdBySuperset: null,
		...overrides,
	};
}

function makeTopLevel(
	id: string,
	kind: "workspace" | "section",
): TopLevelItem {
	return { id, kind, tabOrder: 0 };
}

function makeSection(
	id: string,
	workspaces: GroupWorkspace[],
): GroupSection {
	return {
		id,
		projectId: "p1",
		name: id,
		tabOrder: 0,
		isCollapsed: false,
		color: null,
		workspaces,
	};
}

function makeGroup(overrides: Partial<Group>): Group {
	return {
		project: {
			id: "p1",
			name: "P1",
			color: "#000",
			tabOrder: 0,
			githubOwner: null,
			mainRepoPath: "",
			hideImage: false,
			iconUrl: null,
		},
		workspaces: [],
		sections: [],
		topLevelItems: [],
		...overrides,
	};
}

function makeTab(id: string, workspaceId: string, paneId: string): Tab {
	return {
		id,
		name: id,
		workspaceId,
		createdAt: 0,
		layout: paneId,
	};
}

function makePane(id: string, status?: Pane["status"]): Pane {
	return {
		id,
		tabId: "t",
		type: "terminal",
		name: id,
		status,
	};
}

describe("computeAttentionWorkspaceIds", () => {
	test("includes all unread workspaces", () => {
		const result = computeAttentionWorkspaceIds(new Set(["w1", "w2"]), [], {});
		expect(result).toEqual(new Set(["w1", "w2"]));
	});

	test("includes workspaces whose panes are in review state", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(),
			[makeTab("t1", "w1", "p1")],
			{ p1: makePane("p1", "review") },
		);
		expect(result).toEqual(new Set(["w1"]));
	});

	test("includes workspaces whose panes are waiting for permission", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(),
			[makeTab("t1", "w1", "p1")],
			{ p1: makePane("p1", "permission") },
		);
		expect(result).toEqual(new Set(["w1"]));
	});

	test("excludes workspaces with only working panes", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(),
			[makeTab("t1", "w1", "p1")],
			{ p1: makePane("p1", "working") },
		);
		expect(result).toEqual(new Set());
	});

	test("excludes workspaces with only idle panes", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(),
			[makeTab("t1", "w1", "p1")],
			{ p1: makePane("p1", "idle") },
		);
		expect(result).toEqual(new Set());
	});

	test("permission beats working when aggregating pane statuses", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(),
			[makeTab("t1", "w1", "p1"), makeTab("t2", "w1", "p2")],
			{
				p1: makePane("p1", "working"),
				p2: makePane("p2", "permission"),
			},
		);
		expect(result).toEqual(new Set(["w1"]));
	});

	test("working-only workspace remains excluded even across multiple tabs", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(),
			[makeTab("t1", "w1", "p1"), makeTab("t2", "w1", "p2")],
			{
				p1: makePane("p1", "working"),
				p2: makePane("p2", "idle"),
			},
		);
		expect(result).toEqual(new Set());
	});

	test("merges unread + pane-status sources", () => {
		const result = computeAttentionWorkspaceIds(
			new Set(["w1"]),
			[makeTab("t1", "w2", "p1")],
			{ p1: makePane("p1", "review") },
		);
		expect(result).toEqual(new Set(["w1", "w2"]));
	});
});

describe("indexGrouped", () => {
	test("returns empty when grouped is undefined", () => {
		const { orderedIds, unreadIds } = indexGrouped(undefined);
		expect(orderedIds).toEqual([]);
		expect(unreadIds).toEqual(new Set());
	});

	test("orders top-level workspaces in topLevelItems order", () => {
		const ws1 = makeWorkspace("w1");
		const ws2 = makeWorkspace("w2");
		const grouped: GroupedWorkspaces = [
			makeGroup({
				workspaces: [ws1, ws2],
				topLevelItems: [makeTopLevel("w2", "workspace"), makeTopLevel("w1", "workspace")],
			}),
		];
		const { orderedIds } = indexGrouped(grouped);
		expect(orderedIds).toEqual(["w2", "w1"]);
	});

	test("expands sections inline in their topLevelItems slot", () => {
		const top = makeWorkspace("top");
		const sectionWs1 = makeWorkspace("s-w1", { sectionId: "sec1" });
		const sectionWs2 = makeWorkspace("s-w2", { sectionId: "sec1" });
		const grouped: GroupedWorkspaces = [
			makeGroup({
				workspaces: [top],
				sections: [makeSection("sec1", [sectionWs1, sectionWs2])],
				topLevelItems: [
					makeTopLevel("top", "workspace"),
					makeTopLevel("sec1", "section"),
				],
			}),
		];
		const { orderedIds } = indexGrouped(grouped);
		expect(orderedIds).toEqual(["top", "s-w1", "s-w2"]);
	});

	test("captures unread from both top-level and sectioned workspaces", () => {
		const grouped: GroupedWorkspaces = [
			makeGroup({
				workspaces: [
					makeWorkspace("w1", { isUnread: true }),
					makeWorkspace("w2"),
				],
				sections: [
					makeSection("sec1", [
						makeWorkspace("s-w1", { sectionId: "sec1", isUnread: true }),
						makeWorkspace("s-w2", { sectionId: "sec1" }),
					]),
				],
				topLevelItems: [
					makeTopLevel("w1", "workspace"),
					makeTopLevel("w2", "workspace"),
					makeTopLevel("sec1", "section"),
				],
			}),
		];
		const { unreadIds } = indexGrouped(grouped);
		expect(unreadIds).toEqual(new Set(["w1", "s-w1"]));
	});

	test("skips topLevelItems referring to unknown sections", () => {
		const grouped: GroupedWorkspaces = [
			makeGroup({
				workspaces: [makeWorkspace("w1")],
				sections: [],
				topLevelItems: [
					makeTopLevel("w1", "workspace"),
					makeTopLevel("missing-section", "section"),
				],
			}),
		];
		const { orderedIds } = indexGrouped(grouped);
		expect(orderedIds).toEqual(["w1"]);
	});

	test("flattens across multiple groups in iteration order", () => {
		const grouped: GroupedWorkspaces = [
			makeGroup({
				project: {
					id: "p1",
					name: "P1",
					color: "#000",
					tabOrder: 0,
					githubOwner: null,
					mainRepoPath: "",
					hideImage: false,
					iconUrl: null,
				},
				workspaces: [makeWorkspace("a")],
				topLevelItems: [makeTopLevel("a", "workspace")],
			}),
			makeGroup({
				project: {
					id: "p2",
					name: "P2",
					color: "#000",
					tabOrder: 1,
					githubOwner: null,
					mainRepoPath: "",
					hideImage: false,
					iconUrl: null,
				},
				workspaces: [makeWorkspace("b", { projectId: "p2" })],
				topLevelItems: [makeTopLevel("b", "workspace")],
			}),
		];
		const { orderedIds } = indexGrouped(grouped);
		expect(orderedIds).toEqual(["a", "b"]);
	});
});
