import { describe, expect, it } from "bun:test";
import {
	foldSpaces,
	matchByFoldedName,
	splitPath,
} from "./dropped-path-repair";

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

describe("splitPath", () => {
	it("splits a directory from a basename", () => {
		expect(splitPath("/var/folders/x/Screenshot.png")).toEqual({
			dir: "/var/folders/x",
			base: "Screenshot.png",
		});
	});

	it("treats a bare name as having no directory", () => {
		expect(splitPath("Screenshot.png")).toEqual({
			dir: "",
			base: "Screenshot.png",
		});
	});

	it("keeps the root slash", () => {
		expect(splitPath("/tmp")).toEqual({ dir: "", base: "tmp" });
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
