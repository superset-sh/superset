import { describe, expect, it } from "bun:test";
import type { ChangedFile } from "shared/changes-types";
import { FILE_DIFF_SECTION_COLLAPSED_HEIGHT } from "../../FileDiffSection/constants";
import { getEstimatedFileDiffSectionHeight } from "./getEstimatedFileDiffSectionHeight";

function createFile(
	path: string,
	overrides: Partial<ChangedFile> = {},
): ChangedFile {
	return {
		path,
		status: "modified",
		additions: 10,
		deletions: 5,
		...overrides,
	};
}

describe("getEstimatedFileDiffSectionHeight", () => {
	it("returns the collapsed height for collapsed rows", () => {
		expect(
			getEstimatedFileDiffSectionHeight({
				file: createFile("src/app.ts"),
				isCollapsed: true,
			}),
		).toBe(FILE_DIFF_SECTION_COLLAPSED_HEIGHT);
	});

	it("uses a smaller placeholder for small diffs", () => {
		expect(
			getEstimatedFileDiffSectionHeight({
				file: createFile("src/app.ts", { additions: 12, deletions: 8 }),
				isCollapsed: false,
			}),
		).toBe(200);
	});

	it("uses a medium placeholder for medium diffs", () => {
		expect(
			getEstimatedFileDiffSectionHeight({
				file: createFile("src/app.ts", { additions: 80, deletions: 40 }),
				isCollapsed: false,
			}),
		).toBe(280);
	});

	it("uses the default tall placeholder for large diffs", () => {
		expect(
			getEstimatedFileDiffSectionHeight({
				file: createFile("src/app.ts", { additions: 250, deletions: 150 }),
				isCollapsed: false,
			}),
		).toBe(340);
	});

	it("caps generated files at the extra tall placeholder", () => {
		expect(
			getEstimatedFileDiffSectionHeight({
				file: createFile("bun.lock", { additions: 1, deletions: 1 }),
				isCollapsed: false,
			}),
		).toBe(420);
	});
});
