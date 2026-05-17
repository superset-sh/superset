import { describe, expect, test } from "bun:test";
import { shouldConfirmDeleteDialogKey } from "./shouldConfirmDeleteDialogKey";

const plainEnter = {
	key: "Enter",
	shiftKey: false,
	metaKey: false,
	ctrlKey: false,
	altKey: false,
};

describe("shouldConfirmDeleteDialogKey", () => {
	test("accepts unmodified Enter", () => {
		expect(shouldConfirmDeleteDialogKey(plainEnter)).toBe(true);
	});

	test("rejects modified Enter", () => {
		expect(shouldConfirmDeleteDialogKey({ ...plainEnter, metaKey: true })).toBe(
			false,
		);
		expect(
			shouldConfirmDeleteDialogKey({ ...plainEnter, shiftKey: true }),
		).toBe(false);
		expect(shouldConfirmDeleteDialogKey({ ...plainEnter, ctrlKey: true })).toBe(
			false,
		);
		expect(shouldConfirmDeleteDialogKey({ ...plainEnter, altKey: true })).toBe(
			false,
		);
	});

	test("rejects composition and non-Enter keys", () => {
		expect(
			shouldConfirmDeleteDialogKey({ ...plainEnter, isComposing: true }),
		).toBe(false);
		expect(shouldConfirmDeleteDialogKey({ ...plainEnter, keyCode: 229 })).toBe(
			false,
		);
		expect(shouldConfirmDeleteDialogKey({ ...plainEnter, key: " " })).toBe(
			false,
		);
	});
});
