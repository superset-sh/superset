import { describe, expect, test } from "bun:test";
import type { ChangedFile } from "shared/changes-types";
import { filterChangedFiles } from "./filter-changed-files";

function file(path: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
	return {
		path,
		status: "modified",
		additions: 0,
		deletions: 0,
		...overrides,
	};
}

const FILES: ChangedFile[] = [
	file("src/components/Button/Button.tsx"),
	file("src/components/Input/Input.tsx"),
	file("src/utils/format.ts"),
	file("README.md"),
];

describe("filterChangedFiles", () => {
	test("returns all files when the query is empty", () => {
		expect(filterChangedFiles(FILES, "")).toEqual(FILES);
	});

	test("returns all files when the query is only whitespace", () => {
		expect(filterChangedFiles(FILES, "   ")).toEqual(FILES);
	});

	test("filters by filename substring", () => {
		const result = filterChangedFiles(FILES, "Button");
		expect(result.map((f) => f.path)).toEqual([
			"src/components/Button/Button.tsx",
		]);
	});

	test("filters by directory segment", () => {
		const result = filterChangedFiles(FILES, "components");
		expect(result.map((f) => f.path)).toEqual([
			"src/components/Button/Button.tsx",
			"src/components/Input/Input.tsx",
		]);
	});

	test("matching is case-insensitive", () => {
		const result = filterChangedFiles(FILES, "readme");
		expect(result.map((f) => f.path)).toEqual(["README.md"]);
	});

	test("trims surrounding whitespace from the query", () => {
		const result = filterChangedFiles(FILES, "  format  ");
		expect(result.map((f) => f.path)).toEqual(["src/utils/format.ts"]);
	});

	test("matches a renamed file by its original path", () => {
		const renamed = [
			file("src/components/Card/Card.tsx", {
				status: "renamed",
				oldPath: "src/components/Panel/Panel.tsx",
			}),
		];
		expect(filterChangedFiles(renamed, "Panel").map((f) => f.path)).toEqual([
			"src/components/Card/Card.tsx",
		]);
		expect(filterChangedFiles(renamed, "Card").map((f) => f.path)).toEqual([
			"src/components/Card/Card.tsx",
		]);
	});

	test("returns an empty list when nothing matches", () => {
		expect(filterChangedFiles(FILES, "nonexistent")).toEqual([]);
	});
});
