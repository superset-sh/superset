import { describe, expect, test } from "bun:test";
import { createSelectGuard } from "./createSelectGuard";

/**
 * Reproduces GitHub issue #4939:
 * Intermittently, right-clicking inside a terminal / codex / claude CLI pane
 * closes the entire tab instead of opening the context menu. The user's
 * own diagnosis ("the menu should not respond to the same right click that
 * opens it") matches a well-known platform quirk: on Linux/Wayland the
 * `mouseup` that follows the `contextmenu` event can fall through to the
 * just-opened menu. Because the destructive "Close Pane" item sits at the
 * bottom of `PaneContextMenuItems` and Radix UI flips the menu upward when
 * the right-click is near the bottom of the viewport (common for terminal
 * panes), the leaked `mouseup` lands directly on Close Pane and the tab
 * dies.
 *
 * The reproduction below models the timing — a `select` fired ~0ms after
 * the menu opens — and pins the fix: such selections must be suppressed,
 * while a deliberate click that happens after the guard window must still
 * work.
 */
describe("createSelectGuard - prevents right-click-open mouseup from triggering Close Pane (#4939)", () => {
	test("suppresses an onSelect that fires immediately after menu open", () => {
		let clock = 1000;
		const guardState = createSelectGuard({ now: () => clock });
		let closed = false;
		const guardedClose = guardState.guard(() => {
			closed = true;
		});

		// The contextmenu event opens the menu at clock=1000 (createSelectGuard
		// captured this as openedAt). The Wayland mouseup that fell through
		// fires a few ms later at clock=1005.
		clock = 1005;
		guardedClose();

		expect(closed).toBe(false);
	});

	test("suppresses an onSelect that fires anywhere inside the default 300ms window", () => {
		let clock = 0;
		const guardState = createSelectGuard({ now: () => clock });
		let closed = false;
		const guardedClose = guardState.guard(() => {
			closed = true;
		});

		clock = 250;
		guardedClose();

		expect(closed).toBe(false);
	});

	test("allows an onSelect that fires after the guard window expires", () => {
		let clock = 0;
		const guardState = createSelectGuard({ now: () => clock });
		let closed = false;
		const guardedClose = guardState.guard(() => {
			closed = true;
		});

		clock = 350;
		guardedClose();

		expect(closed).toBe(true);
	});

	test("guard window is configurable per-call site", () => {
		let clock = 0;
		const guardState = createSelectGuard({ guardMs: 100, now: () => clock });
		let closed = false;
		const guardedClose = guardState.guard(() => {
			closed = true;
		});

		clock = 150;
		guardedClose();

		expect(closed).toBe(true);
	});

	test("subsequent intentional clicks well after open all fire", () => {
		let clock = 0;
		const guardState = createSelectGuard({ now: () => clock });
		let count = 0;
		const guardedAction = guardState.guard(() => {
			count += 1;
		});

		clock = 1000;
		guardedAction();
		clock = 1500;
		guardedAction();
		clock = 2000;
		guardedAction();

		expect(count).toBe(3);
	});
});
