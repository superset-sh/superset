import { describe, expect, it } from "bun:test";
import { readOpenFileSearch } from "./readOpenFileSearch";

describe("readOpenFileSearch", () => {
	it("accepts one path as a string and several as an array", () => {
		expect(readOpenFileSearch({ openFile: "/repo/a.ts" }).openFile).toEqual([
			"/repo/a.ts",
		]);
		expect(
			readOpenFileSearch({ openFile: ["/repo/a.ts", "", 3, "/repo/b.ts"] })
				.openFile,
		).toEqual(["/repo/a.ts", "/repo/b.ts"]);
	});

	it("drops an empty or malformed request", () => {
		expect(readOpenFileSearch({})).toEqual({
			openFile: undefined,
			openFileLine: undefined,
			openFileTarget: undefined,
			openFileRequestId: undefined,
		});
		expect(readOpenFileSearch({ openFile: [] }).openFile).toBeUndefined();
		expect(readOpenFileSearch({ openFile: 42 }).openFile).toBeUndefined();
	});

	it("keeps only a positive integer line, from a number or a numeric string", () => {
		expect(readOpenFileSearch({ openFileLine: 12 }).openFileLine).toBe(12);
		expect(readOpenFileSearch({ openFileLine: "7" }).openFileLine).toBe(7);
		for (const bad of [0, -1, 1.5, "abc", "", null]) {
			expect(readOpenFileSearch({ openFileLine: bad }).openFileLine).toBe(
				undefined,
			);
		}
	});

	it("keeps only a known target and a non-empty request id", () => {
		expect(
			readOpenFileSearch({
				openFileTarget: "new-tab",
				openFileRequestId: "r1",
			}),
		).toMatchObject({ openFileTarget: "new-tab", openFileRequestId: "r1" });
		expect(
			readOpenFileSearch({ openFileTarget: "sidebar", openFileRequestId: "" }),
		).toMatchObject({
			openFileTarget: undefined,
			openFileRequestId: undefined,
		});
	});
});
