import { describe, expect, test } from "bun:test";
import {
	reconcileStaleWorkspaceState,
	type WorkspaceLocalStateCollectionLike,
} from "./useReconcileStaleWorkspaceState";

const NOW = Date.UTC(2026, 6, 29);
const DAY_MS = 24 * 60 * 60 * 1000;

function fakeLocalState(
	rows: Array<[string, Date]>,
): WorkspaceLocalStateCollectionLike & { ids: () => string[] } {
	const state = new Map(rows.map(([id, createdAt]) => [id, { createdAt }]));
	return {
		state,
		delete: (workspaceId: string) => void state.delete(workspaceId),
		ids: () => [...state.keys()],
	};
}

describe("reconcileStaleWorkspaceState", () => {
	test("deletes rows for workspaces no host lists, keeps live rows", () => {
		const localState = fakeLocalState([
			["live-1", new Date(NOW - 90 * DAY_MS)],
			["orphan-1", new Date(NOW - 90 * DAY_MS)],
			["orphan-2", new Date(NOW - 8 * DAY_MS)],
		]);

		const removed = reconcileStaleWorkspaceState(
			localState,
			new Set(["live-1"]),
			NOW,
		);

		expect(removed).toBe(2);
		expect(localState.ids()).toEqual(["live-1"]);
	});

	test("keeps unknown rows younger than the create grace", () => {
		const localState = fakeLocalState([
			["in-flight", new Date(NOW - 2 * DAY_MS)],
		]);

		const removed = reconcileStaleWorkspaceState(
			localState,
			new Set(["live-1"]),
			NOW,
		);

		expect(removed).toBe(0);
		expect(localState.ids()).toEqual(["in-flight"]);
	});

	test("treats a row with an invalid createdAt as past the grace", () => {
		const localState = fakeLocalState([["legacy", new Date(Number.NaN)]]);

		expect(
			reconcileStaleWorkspaceState(localState, new Set(["live-1"]), NOW),
		).toBe(1);
		expect(localState.ids()).toEqual([]);
	});
});
