import { describe, expect, test } from "bun:test";
import {
	getAuthoritativeWorkspaceIds,
	reconcileStaleWorkspaceState,
	type WorkspaceLocalStateCollectionLike,
} from "./useReconcileStaleWorkspaceState";

const NOW = Date.UTC(2026, 6, 29);
const DAY_MS = 24 * 60 * 60 * 1000;

function fakeLocalState(
	rows: Array<[string, Date | string]>,
): WorkspaceLocalStateCollectionLike & { ids: () => string[] } {
	const state = new Map(rows.map(([id, createdAt]) => [id, { createdAt }]));
	return {
		state,
		delete: (workspaceId: string) => void state.delete(workspaceId),
		ids: () => [...state.keys()],
	};
}

describe("reconcileStaleWorkspaceState", () => {
	test("excludes cloud and snapshot fallbacks from destructive live IDs", () => {
		expect(
			getAuthoritativeWorkspaceIds([
				{ id: "live", source: "host", hostReachable: true },
				{ id: "snapshot", source: "host", hostReachable: false },
				{ id: "cloud", source: "cloud", hostReachable: false },
			]),
		).toEqual(new Set(["live"]));
	});

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

	test("keeps a recent persisted ISO timestamp within the create grace", () => {
		const localState = fakeLocalState([
			["persisted-in-flight", new Date(NOW - 2 * DAY_MS).toISOString()],
		]);

		const removed = reconcileStaleWorkspaceState(
			localState,
			new Set(["live-1"]),
			NOW,
		);

		expect(removed).toBe(0);
		expect(localState.ids()).toEqual(["persisted-in-flight"]);
	});

	test("deletes aged rows when the authoritative workspace list is empty", () => {
		const localState = fakeLocalState([
			["last-deleted", new Date(NOW - 8 * DAY_MS)],
			["in-flight", new Date(NOW - 2 * DAY_MS)],
		]);

		const removed = reconcileStaleWorkspaceState(localState, new Set(), NOW);

		expect(removed).toBe(1);
		expect(localState.ids()).toEqual(["in-flight"]);
	});

	test("treats a row with an invalid createdAt as past the grace", () => {
		const localState = fakeLocalState([["legacy", new Date(Number.NaN)]]);

		expect(
			reconcileStaleWorkspaceState(localState, new Set(["live-1"]), NOW),
		).toBe(1);
		expect(localState.ids()).toEqual([]);
	});

	test("does not grant an indefinite grace to future timestamps", () => {
		const localState = fakeLocalState([
			["future-clock-skew", new Date(NOW + 365 * DAY_MS).toISOString()],
		]);

		expect(reconcileStaleWorkspaceState(localState, new Set(), NOW)).toBe(1);
		expect(localState.ids()).toEqual([]);
	});

	test("keeps a newly seeded row across plausible clock rollback", () => {
		const localState = fakeLocalState([
			["future-clock-skew", new Date(NOW + 2 * DAY_MS).toISOString()],
		]);

		expect(reconcileStaleWorkspaceState(localState, new Set(), NOW)).toBe(0);
		expect(localState.ids()).toEqual(["future-clock-skew"]);
	});
});
