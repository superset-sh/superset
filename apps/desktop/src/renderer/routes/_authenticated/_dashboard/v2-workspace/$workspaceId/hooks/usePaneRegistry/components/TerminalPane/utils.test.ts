import { describe, expect, it } from "bun:test";
import { escapePathsLikeTerminalDrag, resolveLocalFilePaths } from "./utils";

const file = (name: string) => ({ name }) as File;
const pathsOnDisk: Record<string, string> = {
	"photo.png": "/Users/alice/Desktop/photo.png",
	"notes.pdf": "/Users/alice/Documents/notes.pdf",
};
const getPathForFile = (f: File) => pathsOnDisk[f.name] ?? "";

describe("resolveLocalFilePaths", () => {
	it("returns the on-disk path of every file copied in Finder", () => {
		expect(
			resolveLocalFilePaths(
				[file("photo.png"), file("notes.pdf")],
				getPathForFile,
			),
		).toEqual([
			"/Users/alice/Desktop/photo.png",
			"/Users/alice/Documents/notes.pdf",
		]);
	});

	it("returns null for a screenshot, which has no path on disk", () => {
		expect(resolveLocalFilePaths([file("image.png")], getPathForFile)).toBe(
			null,
		);
	});

	it("returns null when only some of the files have a path", () => {
		expect(
			resolveLocalFilePaths(
				[file("photo.png"), file("image.png")],
				getPathForFile,
			),
		).toBe(null);
	});

	it("returns null for a path with a control character", () => {
		for (const path of [
			"/tmp/line\nbreak.png",
			"/tmp/esc\u001b[201~.png",
			"/tmp/interrupt\u0003.png",
			"/tmp/delete\u007f.png",
			"/tmp/c1\u009b.png",
		]) {
			expect(resolveLocalFilePaths([file("odd")], () => path)).toBe(null);
		}
	});
});

describe("escapePathsLikeTerminalDrag", () => {
	it("backslash-escapes each path the way a Terminal.app drag does", () => {
		expect(
			escapePathsLikeTerminalDrag([
				"/Users/alice/Desktop/Screenshot 2026-10-15 at 9.41.07\u202fAM.png",
				"/Users/alice/Client : Brief/team's (final) #2 & co.pdf",
				"/Users/alice/plain.png",
			]),
		).toBe(
			"/Users/alice/Desktop/Screenshot\\ 2026-10-15\\ at\\ 9.41.07\\\u202fAM.png " +
				"/Users/alice/Client\\ \\:\\ Brief/team\\'s\\ \\(final\\)\\ \\#2\\ \\&\\ co.pdf " +
				"/Users/alice/plain.png",
		);
	});
});
