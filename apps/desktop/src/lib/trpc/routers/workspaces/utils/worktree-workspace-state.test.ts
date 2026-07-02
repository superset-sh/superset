import { describe, expect, test } from "bun:test";
import {
	findActiveWorkspace,
	worktreeHasClaimingWorkspace,
} from "./worktree-workspace-state";

/**
 * Reproduction + regression coverage for #5370 ("Worktree sidebar is buggy:
 * worktrees still show up when I delete them, sometimes worktrees randomly
 * disappear").
 *
 * The sidebar classifies a worktree as a reopenable "closed worktree" when it
 * has no active workspace. Deleting an open workspace is asynchronous: the
 * workspace row is first marked `deletingAt` (so it is filtered out of the open
 * list), and only later — after teardown and disk removal — is the worktree
 * record removed. During that window the worktree's only workspace is the one
 * being deleted.
 *
 * The buggy classification ignored deleting workspaces entirely, so the
 * worktree popped back into the sidebar as "closed" mid-deletion, then vanished
 * once teardown finished.
 */
describe("worktreeHasClaimingWorkspace (#5370)", () => {
	test("a worktree with no workspaces is not claimed (genuinely closed)", () => {
		expect(worktreeHasClaimingWorkspace([])).toBe(false);
	});

	test("a worktree with an active workspace is claimed", () => {
		expect(worktreeHasClaimingWorkspace([{ deletingAt: null }])).toBe(true);
	});

	test("a worktree whose only workspace is being deleted is still claimed", () => {
		// The reported bug: mid-deletion the worktree must NOT be offered as a
		// closed/openable worktree. Before the fix this returned false because the
		// deleting workspace was filtered out, causing the worktree to reappear.
		expect(
			worktreeHasClaimingWorkspace([{ deletingAt: 1_700_000_000_000 }]),
		).toBe(true);
	});
});

describe("findActiveWorkspace (#5370)", () => {
	test("returns null when the only workspace is being deleted", () => {
		const deleting = { id: "ws-1", deletingAt: 1_700_000_000_000 };
		expect(findActiveWorkspace([deleting])).toBeNull();
	});

	test("returns the non-deleting workspace when one exists", () => {
		const active = { id: "ws-1", deletingAt: null };
		expect(findActiveWorkspace([active])).toBe(active);
	});

	test("ignores deleting workspaces and returns the active one", () => {
		const deleting = { id: "ws-1", deletingAt: 1_700_000_000_000 };
		const active = { id: "ws-2", deletingAt: null };
		expect(findActiveWorkspace([deleting, active])).toBe(active);
	});
});
