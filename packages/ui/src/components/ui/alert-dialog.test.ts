import { describe, expect, test } from "bun:test";

import { alertDialogContentClassName } from "./alert-dialog";

// Reproduces github.com/superset/issues/4605: a long workspace name (e.g. a
// pasted Claude Code conversation) makes the close-workspace modal grow taller
// than the viewport. Without a max-height + scroll on AlertDialogContent, the
// footer (Cancel / Hide / Delete) is clipped off-screen and the user has no
// way to dismiss the dialog short of quitting the app.
describe("alertDialogContentClassName", () => {
	test("caps height to the viewport so footers stay reachable", () => {
		expect(alertDialogContentClassName).toMatch(/\bmax-h-\[/);
	});

	test("scrolls overflowing content instead of clipping it", () => {
		expect(alertDialogContentClassName).toMatch(/\boverflow-y-(auto|scroll)\b/);
	});
});
