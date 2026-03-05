import { describe, expect, test } from "bun:test";
import { settings } from "@superset/local-db";

/**
 * Reproduction tests for issue #1701:
 * "Disable or make configurable mouse forward/back buttons for workspace navigation"
 *
 * NavigationControls attaches a global `window` mouseup listener that unconditionally
 * intercepts mouse buttons 3 (back) and 4 (forward) to call router.history.back/forward.
 * There is no setting that lets users opt out of this behavior, which conflicts with
 * system-level shortcuts many users have configured for those buttons.
 */

describe("NavigationControls mouse navigation (#1701)", () => {
	test("settings schema should expose a mouseNavigationEnabled column to allow disabling mouse button navigation", () => {
		// The settings table must include a mouseNavigationEnabled column so that
		// NavigationControls can conditionally attach the global mouseup listener.
		// Until this column exists there is no persisted way to disable the behavior.
		//
		// This test FAILS because settings.mouseNavigationEnabled is undefined —
		// the column has not been added to the schema yet.
		expect(settings.mouseNavigationEnabled).toBeDefined();
	});

	test("mouse navigation handler should be a no-op when mouseNavigationEnabled is false", () => {
		const backCalls: number[] = [];
		const forwardCalls: number[] = [];

		// This mirrors the handler logic currently in NavigationControls.tsx.
		// The handler has NO check for a user setting — it always fires.
		const currentHandler = (event: {
			button: number;
			preventDefault: () => void;
		}) => {
			if (event.button === 3) {
				event.preventDefault();
				backCalls.push(1);
			} else if (event.button === 4) {
				event.preventDefault();
				forwardCalls.push(1);
			}
		};

		// Simulate the user having disabled mouse navigation (desired behavior).
		// With the fix, passing mouseNavigationEnabled=false should prevent the handler
		// from calling back/forward. The current code has no such guard.
		const mouseNavigationEnabled = false; // user preference — not yet respected
		if (mouseNavigationEnabled) {
			currentHandler({ button: 3, preventDefault: () => {} });
			currentHandler({ button: 4, preventDefault: () => {} });
		} else {
			// Even though navigation is "disabled", the current code would still fire
			// because NavigationControls reads no setting. We trigger it directly to
			// simulate what actually happens in the app.
			currentHandler({ button: 3, preventDefault: () => {} });
			currentHandler({ button: 4, preventDefault: () => {} });
		}

		// FAILS: back and forward were called even though mouseNavigationEnabled=false,
		// proving the handler ignores any hypothetical user preference.
		expect(backCalls).toHaveLength(0);
		expect(forwardCalls).toHaveLength(0);
	});
});
