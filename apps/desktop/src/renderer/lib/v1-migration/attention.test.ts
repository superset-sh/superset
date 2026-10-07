import { describe, expect, test } from "bun:test";
import {
	attentionSignature,
	listV1AttentionItems,
	owesFullPass,
	WORKTREE_NEEDS_ATTENTION,
} from "./attention";
import type { V1LedgerRow } from "./ledger";

const row = (over: Partial<V1LedgerRow>): V1LedgerRow => ({
	v1Id: "p1",
	kind: "project",
	status: "skipped",
	v2Id: null,
	reason: "needs-relocate",
	...over,
});

const v1 = {
	v1Projects: [{ id: "p1", name: "alpha", mainRepoPath: "/repo/alpha" }],
	v1Workspaces: [
		{ id: "w1", projectId: "p1", name: "beta wip", worktreeId: "t1" },
	],
	v1Worktrees: [{ id: "t1", path: "/wt/beta" }],
};

describe("listV1AttentionItems", () => {
	test("lists skipped projects and worktrees that still hold user files", () => {
		const items = listV1AttentionItems({
			...v1,
			ledgerRows: [
				row({}),
				row({
					v1Id: "w1",
					kind: "workspace",
					reason: WORKTREE_NEEDS_ATTENTION,
				}),
			],
		});
		expect(items).toEqual([
			{ kind: "project", v1Id: "p1", name: "alpha", path: "/repo/alpha" },
			{ kind: "worktree", v1Id: "w1", name: "beta wip", path: "/wt/beta" },
		]);
	});

	test("lists a repo it could not read as git, since it may hold work", () => {
		const items = listV1AttentionItems({
			...v1,
			ledgerRows: [row({ reason: "not-a-git-repo" })],
		});
		expect(items).toMatchObject([{ kind: "project", v1Id: "p1" }]);
	});

	test("ignores skips with nothing on disk and rows the user deleted", () => {
		const items = listV1AttentionItems({
			...v1,
			ledgerRows: [
				row({ reason: "repo-path-missing" }),
				row({ v1Id: "w1", kind: "workspace", reason: "no-worktree-on-disk" }),
				row({ v1Id: "deleted-project" }),
				row({ status: "success" }),
			],
		});
		expect(items).toEqual([]);
	});

	test("signature does not depend on order", () => {
		const a = { kind: "project", v1Id: "p1", name: "", path: "" } as const;
		const b = { kind: "worktree", v1Id: "w1", name: "", path: "" } as const;
		expect(attentionSignature([a, b])).toBe(attentionSignature([b, a]));
	});
});

describe("owesFullPass", () => {
	const missingRow = row({
		v1Id: "w1",
		kind: "workspace",
		reason: "no-worktree-on-disk",
	});

	test("a worktree skipped as missing whose folder exists is rechecked", async () => {
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [missingRow],
				resolvePaths: async (paths) => paths,
			}),
		).toBe(true);
	});

	test("a worktree skipped as missing whose folder is gone is left alone", async () => {
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [missingRow],
				resolvePaths: async (paths) => paths.map(() => null),
			}),
		).toBe(false);
	});

	test("a workspace skipped because its repo was gone is rechecked once the repo is back", async () => {
		const repoGone = row({
			v1Id: "w1",
			kind: "workspace",
			reason: "repo-path-missing",
		});
		const resolveOnly = (existing: string) => async (paths: string[]) =>
			paths.map((path) => (path === existing ? path : null));
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [repoGone],
				resolvePaths: resolveOnly("/repo/alpha"),
			}),
		).toBe(true);
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [repoGone],
				resolvePaths: resolveOnly("/wt/beta"),
			}),
		).toBe(false);
	});

	test("a repo skipped as missing is rechecked once its drive is back", async () => {
		const unmounted = row({ reason: "repo-path-missing" });
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [unmounted],
				resolvePaths: async (paths) => paths,
			}),
		).toBe(true);
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [unmounted],
				resolvePaths: async (paths) => paths.map(() => null),
			}),
		).toBe(false);
	});

	test("a project or workspace that failed is retried after completion", async () => {
		expect(
			await owesFullPass({
				...v1,
				ledgerRows: [row({ v1Id: "w1", kind: "workspace", status: "error" })],
				resolvePaths: async (paths) => paths.map(() => null),
			}),
		).toBe(true);
	});
});
