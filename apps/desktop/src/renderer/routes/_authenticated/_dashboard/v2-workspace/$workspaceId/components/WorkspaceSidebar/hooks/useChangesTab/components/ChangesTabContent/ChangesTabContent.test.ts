import { describe, expect, test } from "bun:test";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { filterChangesetFiles } from "./filterChangesetFiles";
import { shouldShowChangesLoading } from "./shouldShowChangesLoading";

describe("shouldShowChangesLoading", () => {
	test("shows loading before the first exact-workspace snapshot arrives", () => {
		expect(shouldShowChangesLoading({ data: undefined, isLoading: true })).toBe(
			true,
		);
	});

	test("keeps cached data visible during a background refresh", () => {
		expect(
			shouldShowChangesLoading({
				data: { workspaceId: "one" },
				isLoading: true,
			}),
		).toBe(false);
	});
});

function file(path: string, oldPath?: string): ChangesetFile {
	return {
		path,
		oldPath,
		status: "modified",
		additions: 1,
		deletions: 1,
		source: { kind: "unstaged" },
	};
}

describe("filterChangesetFiles", () => {
	const files = [
		file("apps/desktop/src/Sidebar.tsx"),
		file("apps/web/src/page.ts"),
		file("README.md"),
	];

	test("returns everything for an empty or whitespace query", () => {
		expect(filterChangesetFiles(files, "")).toEqual(files);
		expect(filterChangesetFiles(files, "   ")).toEqual(files);
	});

	test("matches case-insensitively anywhere in the path", () => {
		expect(filterChangesetFiles(files, "SIDEBAR")).toEqual([files[0]]);
		expect(filterChangesetFiles(files, "src")).toEqual([files[0], files[1]]);
	});

	test("requires every whitespace-separated term to match", () => {
		expect(filterChangesetFiles(files, "src tsx")).toEqual([files[0]]);
		expect(filterChangesetFiles(files, "src missing")).toEqual([]);
	});

	test("matches a rename by its old path", () => {
		const renamed = file("apps/new/Name.tsx", "apps/old/Legacy.tsx");
		expect(filterChangesetFiles([renamed], "legacy")).toEqual([renamed]);
	});

	test("terms never match across the path/oldPath boundary", () => {
		const renamed = file("a.ts", "b.ts");
		expect(filterChangesetFiles([renamed], "a.tsb.ts")).toEqual([]);
	});
});
