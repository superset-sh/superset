import { describe, expect, it } from "bun:test";
import {
	getBaseName,
	getParentPath,
	joinAbsolutePath,
	resolveNewDirectoryTarget,
	resolveNewFileTarget,
} from "./new-item-paths";

describe("new-item-paths", () => {
	it("resolves nested file input and creates missing parent path target", () => {
		expect(resolveNewFileTarget("/workspace", "hi/hi.txt")).toEqual({
			targetParentPath: "/workspace/hi",
			absolutePath: "/workspace/hi/hi.txt",
			fileName: "hi.txt",
		});
	});

	it("resolves nested folder input", () => {
		expect(resolveNewDirectoryTarget("/workspace", "hi/there")).toEqual({
			absolutePath: "/workspace/hi/there",
		});
	});

	it("supports windows-style separators in new item input", () => {
		expect(resolveNewFileTarget("C:\\workspace", "hi\\hi.txt")).toEqual({
			targetParentPath: "C:\\workspace\\hi",
			absolutePath: "C:\\workspace\\hi\\hi.txt",
			fileName: "hi.txt",
		});
	});

	it("rejects traversal segments", () => {
		expect(resolveNewFileTarget("/workspace", "../secret.txt")).toBeNull();
		expect(resolveNewDirectoryTarget("/workspace", "hi/../secret")).toBeNull();
	});

	it("joins and derives path segments consistently", () => {
		expect(joinAbsolutePath("/workspace", "notes.txt")).toEqual(
			"/workspace/notes.txt",
		);
		expect(getBaseName("/workspace/nested/notes.txt")).toEqual("notes.txt");
		expect(getParentPath("/workspace/nested/notes.txt")).toEqual(
			"/workspace/nested",
		);
	});
});
