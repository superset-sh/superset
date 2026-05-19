import { describe, expect, test } from "bun:test";
import { splitFolderDisplayPath } from "./utils";

describe("splitFolderDisplayPath", () => {
	test("returns the input as folderName when there is no slash", () => {
		expect(splitFolderDisplayPath("Root Path")).toEqual({
			parentPath: "",
			folderName: "Root Path",
		});
		expect(splitFolderDisplayPath("src")).toEqual({
			parentPath: "",
			folderName: "src",
		});
	});

	test("splits a deep path so the basename can be shown prominently", () => {
		expect(
			splitFolderDisplayPath(
				"apps/desktop/src/renderer/screens/main/components",
			),
		).toEqual({
			parentPath: "apps/desktop/src/renderer/screens/main",
			folderName: "components",
		});
	});

	test("splits a single-level path", () => {
		expect(splitFolderDisplayPath("src/components")).toEqual({
			parentPath: "src",
			folderName: "components",
		});
	});

	test("handles an empty path", () => {
		expect(splitFolderDisplayPath("")).toEqual({
			parentPath: "",
			folderName: "",
		});
	});

	test("handles a trailing slash by treating the basename as empty", () => {
		expect(splitFolderDisplayPath("src/")).toEqual({
			parentPath: "src",
			folderName: "",
		});
	});
});
