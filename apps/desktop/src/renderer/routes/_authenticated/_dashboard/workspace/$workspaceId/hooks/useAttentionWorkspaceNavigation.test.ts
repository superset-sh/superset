import { describe, expect, test } from "bun:test";
import type { Tab } from "renderer/stores/tabs/types";
import type { Pane } from "shared/tabs-types";
import { computeAttentionWorkspaceIds } from "./useAttentionWorkspaceNavigation";

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
