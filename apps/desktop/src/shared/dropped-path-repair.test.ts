import { describe, expect, it } from "bun:test";
import { foldSpaces, matchByFoldedName } from "./dropped-path-repair";

describe("foldSpaces", () => {
	it("folds the narrow no-break space macOS puts before am/pm", () => {
		expect(foldSpaces("9.42.51\u202fam.png")).toBe("9.42.51 am.png");
	});

	it("folds the other space separators", () => {
		expect(foldSpaces("a\u00a0b\u2007c\u205fd\u3000e")).toBe("a b c d e");
	});

	it("leaves a plain name alone", () => {
		expect(foldSpaces("Screenshot 1.png")).toBe("Screenshot 1.png");
	});

	it("does not touch tabs or newlines, which are not space separators", () => {
		expect(foldSpaces("a\tb\nc")).toBe("a\tb\nc");
	});
});

describe("matchByFoldedName", () => {
	const onDisk = "Screenshot 2026-08-12 at 9.42.51\u202fam.png";

	it("finds the on-disk name behind a plain-space basename", () => {
		expect(
			matchByFoldedName("Screenshot 2026-08-12 at 9.42.51 am.png", [
				"other.png",
				onDisk,
			]),
		).toBe(onDisk);
	});

	it("returns null when nothing matches", () => {
		expect(matchByFoldedName("missing.png", [onDisk])).toBeNull();
	});

	it("returns null when two entries fold to the same name", () => {
		expect(
			matchByFoldedName("a b.png", ["a b.png", "a\u202fb.png"]),
		).toBeNull();
	});

	it("returns null for an empty directory", () => {
		expect(matchByFoldedName("a.png", [])).toBeNull();
	});

	it("does not match across a different name", () => {
		expect(matchByFoldedName("a b.png", ["a-b.png"])).toBeNull();
	});
});
