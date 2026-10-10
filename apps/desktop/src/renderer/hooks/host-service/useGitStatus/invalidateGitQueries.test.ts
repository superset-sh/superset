import { beforeEach, describe, expect, test } from "bun:test";
import { invalidateGitQueries } from "./invalidateGitQueries";

const calls = {
	getDiffPatch: [] as unknown[][],
	getDiff: [] as unknown[][],
	getBaseBranch: [] as unknown[][],
	listCommits: [] as unknown[][],
};

const record = (key: keyof typeof calls) => ({
	invalidate: (...args: unknown[]) => {
		calls[key].push(args);
		return Promise.resolve();
	},
});

const git = {
	getDiffPatch: record("getDiffPatch"),
	getDiff: record("getDiff"),
	getBaseBranch: record("getBaseBranch"),
	listCommits: record("listCommits"),
} as unknown as Parameters<typeof invalidateGitQueries>[0];

/** A `git.getDiffPatch` query as the Changes pane registers it: keyed on
 * what is diffed, with the paths its cached patch covers in its data. */
function patchQuery(
	category: "against-base" | "staged" | "unstaged" | "commit",
	requestedPaths: string[],
) {
	const input = { workspaceId: "workspace-1", category };
	return {
		queryKey: [["git", "getDiffPatch"], { input, type: "query" }],
		state: { data: { kind: "patch", patch: "", requestedPaths } },
	};
}

function lastPatchPredicate() {
	const [, filters] = calls.getDiffPatch.at(-1) ?? [];
	const predicate = (
		filters as { predicate?: (query: unknown) => boolean } | undefined
	)?.predicate;
	if (!predicate)
		throw new Error("getDiffPatch was invalidated without a predicate");
	return predicate;
}

beforeEach(() => {
	for (const entries of Object.values(calls)) entries.length = 0;
});

describe("invalidateGitQueries", () => {
	test("invalidates commit lists and every patch after a broad git metadata change", () => {
		invalidateGitQueries(git, "workspace-1", {});
		expect(calls.listCommits).toEqual([[{ workspaceId: "workspace-1" }]]);
		expect(calls.getDiffPatch).toEqual([[{ workspaceId: "workspace-1" }]]);
	});

	test("does not invalidate commit lists for path-scoped worktree edits", () => {
		invalidateGitQueries(git, "workspace-1", { paths: ["src/file.ts"] });
		expect(calls.listCommits).toEqual([]);
	});

	test("a worktree edit refetches the patch holding the file and not a sibling", () => {
		invalidateGitQueries(git, "workspace-1", { paths: ["src/a.ts"] });
		expect(calls.getDiffPatch).toHaveLength(1);
		expect(calls.getDiffPatch[0]?.[0]).toEqual({ workspaceId: "workspace-1" });
		const affected = lastPatchPredicate();
		expect(affected(patchQuery("against-base", ["src/a.ts", "src/b.ts"]))).toBe(
			true,
		);
		expect(affected(patchQuery("against-base", ["src/b.ts"]))).toBe(false);
		expect(affected(patchQuery("staged", ["src/b.ts"]))).toBe(false);
	});

	test("a worktree edit always refetches the unstaged patch, which the file may be joining", () => {
		invalidateGitQueries(git, "workspace-1", { paths: ["src/new.ts"] });
		expect(lastPatchPredicate()(patchQuery("unstaged", ["src/a.ts"]))).toBe(
			true,
		);
	});
});
