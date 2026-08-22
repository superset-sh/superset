import { beforeEach, describe, expect, test } from "bun:test";
import {
	backfillCompletedAt,
	recordV1WorkspaceCreatedIfNew,
	STAR_NAG_INITIAL_THRESHOLD,
	useStarNagStore,
} from "./store";

function resetStore() {
	useStarNagStore.setState({
		completed: false,
		completedAt: null,
		workspacesCreatedSinceBaseline: 0,
		nextThreshold: STAR_NAG_INITIAL_THRESHOLD,
		deferredUntil: null,
	});
}

describe("useStarNagStore", () => {
	beforeEach(() => {
		resetStore();
	});

	test("does not show the threshold card before the threshold is reached", () => {
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD - 1; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		expect(useStarNagStore.getState().shouldShowThresholdCard()).toBe(false);
	});

	test("shows the threshold card once the threshold is reached", () => {
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		expect(useStarNagStore.getState().shouldShowThresholdCard()).toBe(true);
	});

	test("dismiss() doubles the threshold, resets the counter, and starts a cooldown", () => {
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		useStarNagStore.getState().dismiss();

		const state = useStarNagStore.getState();
		expect(state.nextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD * 2);
		expect(state.workspacesCreatedSinceBaseline).toBe(0);
		expect(state.deferredUntil).toBeGreaterThan(Date.now());
		expect(state.shouldShowThresholdCard()).toBe(false);
	});

	test("stays hidden during cooldown even if enough workspaces are recorded", () => {
		useStarNagStore.setState({ deferredUntil: Date.now() + 10_000 });
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		expect(useStarNagStore.getState().shouldShowThresholdCard()).toBe(false);
		expect(useStarNagStore.getState().isEligible()).toBe(false);
	});

	test("shows again once the doubled threshold is met after cooldown expires", () => {
		useStarNagStore.setState({
			nextThreshold: STAR_NAG_INITIAL_THRESHOLD * 2,
			deferredUntil: Date.now() - 1,
		});
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD * 2 - 1; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		expect(useStarNagStore.getState().shouldShowThresholdCard()).toBe(false);
		useStarNagStore.getState().recordWorkspaceCreated();
		expect(useStarNagStore.getState().shouldShowThresholdCard()).toBe(true);
	});

	test("markCompleted() mutes the card regardless of count or cooldown, and stamps completedAt", () => {
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		useStarNagStore.getState().markCompleted();

		expect(useStarNagStore.getState().shouldShowThresholdCard()).toBe(false);
		expect(useStarNagStore.getState().isEligible()).toBe(false);
		expect(useStarNagStore.getState().completed).toBe(true);
		expect(useStarNagStore.getState().completedAt).toBeGreaterThan(0);
		expect(useStarNagStore.getState().deferredUntil).toBeNull();
	});

	test("markUnstarred() clears completed and completedAt, but starts a cooldown instead of reopening immediately", () => {
		for (let i = 0; i < STAR_NAG_INITIAL_THRESHOLD; i++) {
			useStarNagStore.getState().recordWorkspaceCreated();
		}
		useStarNagStore.getState().markCompleted();
		useStarNagStore.getState().markUnstarred();

		const state = useStarNagStore.getState();
		expect(state.completed).toBe(false);
		expect(state.completedAt).toBeNull();
		// Not immediately eligible: workspacesCreatedSinceBaseline/nextThreshold
		// are still frozen at their completion-time values, so without a
		// cooldown the card would pop straight back up the instant the unstar
		// is detected — a real bug this test guards against regressing to.
		expect(state.deferredUntil).toBeGreaterThan(Date.now());
		expect(state.isEligible()).toBe(false);
		expect(state.shouldShowThresholdCard()).toBe(false);
	});

	test("isEligible() is true with no completion and no active cooldown", () => {
		expect(useStarNagStore.getState().isEligible()).toBe(true);
	});

	test("snoozeThresholdCard() starts a cooldown without doubling the threshold", () => {
		useStarNagStore.getState().snoozeThresholdCard();

		const state = useStarNagStore.getState();
		expect(state.nextThreshold).toBe(STAR_NAG_INITIAL_THRESHOLD);
		expect(state.deferredUntil).toBeGreaterThan(Date.now());
		expect(state.isEligible()).toBe(false);
	});

	test("recordV1WorkspaceCreatedIfNew() only counts genuinely new workspaces", () => {
		recordV1WorkspaceCreatedIfNew(true);
		expect(useStarNagStore.getState().workspacesCreatedSinceBaseline).toBe(0);

		recordV1WorkspaceCreatedIfNew(false);
		expect(useStarNagStore.getState().workspacesCreatedSinceBaseline).toBe(1);
	});
});

describe("backfillCompletedAt", () => {
	test("stamps completedAt for a pre-timestamp-schema profile (completed true, completedAt null)", () => {
		const now = 1_000_000;
		expect(
			backfillCompletedAt({ completed: true, completedAt: null }, now),
		).toEqual({ completed: true, completedAt: now });
	});

	test("leaves an already-timestamped profile untouched", () => {
		const result = backfillCompletedAt(
			{ completed: true, completedAt: 42 },
			1_000_000,
		);
		expect(result.completedAt).toBe(42);
	});

	test("leaves a never-completed profile's null completedAt alone", () => {
		const result = backfillCompletedAt(
			{ completed: false, completedAt: null },
			1_000_000,
		);
		expect(result.completedAt).toBeNull();
	});
});
