import { describe, expect, test } from "bun:test";

import {
	alertDialogContentClassName,
	alertDialogDescriptionClassName,
	alertDialogHeaderClassName,
	alertDialogTitleClassName,
} from "./alert-dialog";

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

	test("never scrolls horizontally so the footer stays in view", () => {
		expect(alertDialogContentClassName).toMatch(/\boverflow-x-hidden\b/);
	});
});

// A workspace name that is one unbreakable token (underscores, camelCase, a
// long slug with no hyphens) sizes the grid's implicit column to the title's
// min-content width, past the dialog's max width. Since overflow-y: auto
// forces computed overflow-x to auto, the excess clips and the right-aligned
// footer scrolls out of view. happy-dom has no layout engine, so this can
// only assert the wrapping utilities are present; real verification needs CDP.
describe("alert dialog text wrapping", () => {
	test("title can shrink below its min-content width and break words", () => {
		expect(alertDialogTitleClassName).toMatch(/\bmin-w-0\b/);
		expect(alertDialogTitleClassName).toMatch(/\bbreak-words\b/);
	});

	test("description can shrink below its min-content width and break words", () => {
		expect(alertDialogDescriptionClassName).toMatch(/\bmin-w-0\b/);
		expect(alertDialogDescriptionClassName).toMatch(/\bbreak-words\b/);
	});

	test("header can shrink inside the grid column", () => {
		expect(alertDialogHeaderClassName).toMatch(/\bmin-w-0\b/);
	});
});
