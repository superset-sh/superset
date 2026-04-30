import { describe, expect, test } from "bun:test";
import { SYNC_TIMEOUT_MS } from "./constants";

describe("SYNC_TIMEOUT_MS", () => {
	// Regression guard for issue #3901: a 10s threshold caused the
	// "Workspace was created but hasn't synced to this device yet" warning
	// to fire on every v2 worktree create, because Electric replication of
	// a brand-new v2_workspaces row routinely exceeds 10s. The warning UI
	// is a stall fallback, not a progress indicator — it must wait until
	// well past normal sync latency before triggering.
	test("waits past typical Electric sync latency before showing the stall warning", () => {
		const REPORTED_SYNC_LATENCY_MS = 10_000;
		expect(SYNC_TIMEOUT_MS).toBeGreaterThan(REPORTED_SYNC_LATENCY_MS);
	});

	test("still bounded so a genuinely stuck sync surfaces a recovery affordance", () => {
		const FIVE_MINUTES_MS = 5 * 60 * 1000;
		expect(SYNC_TIMEOUT_MS).toBeLessThanOrEqual(FIVE_MINUTES_MS);
	});
});
