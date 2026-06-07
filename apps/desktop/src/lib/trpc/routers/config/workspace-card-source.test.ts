import { describe, expect, it } from "bun:test";
import { join, resolve, sep } from "node:path";
import { extractMainRepoFromGitdir } from "./workspace-card-source";

describe("extractMainRepoFromGitdir", () => {
	it("extracts main repo path from standard gitdir line", () => {
		const content =
			"gitdir: /Users/adelinb/Documents/Meta-Vault/.git/worktrees/my-worktree";
		expect(extractMainRepoFromGitdir(content)).toBe(
			"/Users/adelinb/Documents/Meta-Vault",
		);
	});

	it("trims leading/trailing whitespace before matching", () => {
		const content =
			"  gitdir: /home/user/projects/repo/.git/worktrees/feature-branch\n";
		expect(extractMainRepoFromGitdir(content)).toBe("/home/user/projects/repo");
	});

	it("returns null for a bare .git directory reference (not a worktree)", () => {
		const content = "gitdir: /some/path/.git";
		expect(extractMainRepoFromGitdir(content)).toBeNull();
	});

	it("returns null for an empty string", () => {
		expect(extractMainRepoFromGitdir("")).toBeNull();
	});

	it("returns null for unrelated file content", () => {
		expect(extractMainRepoFromGitdir("ref: refs/heads/main")).toBeNull();
	});

	it("handles nested paths with multiple segments correctly", () => {
		const content = "gitdir: /a/b/c/d/.git/worktrees/ws-name";
		expect(extractMainRepoFromGitdir(content)).toBe("/a/b/c/d");
	});
});

// Inline the containment check logic so this test file has no Electron imports.
// Must stay in sync with resolveWorktreeProjectRepoPath in workspace-card-source.ts.
function worktreeDirIsContained(
	worktreesRoot: string,
	projectId: string,
): boolean {
	const worktreesDir = join(worktreesRoot, projectId);
	const resolvedDir = resolve(worktreesDir);
	const resolvedRoot = resolve(worktreesRoot);
	return (
		resolvedDir === resolvedRoot || resolvedDir.startsWith(resolvedRoot + sep)
	);
}

describe("projectId containment check", () => {
	const root = "/home/user/.superset/worktrees";

	it("allows a normal UUID-shaped projectId", () => {
		expect(
			worktreeDirIsContained(root, "914758f0-9f44-4362-be7f-cda39e86ea73"),
		).toBe(true);
	});

	it("allows an alphanumeric projectId", () => {
		expect(worktreeDirIsContained(root, "abc123")).toBe(true);
	});

	it("rejects ../ path traversal", () => {
		expect(worktreeDirIsContained(root, "../../../etc")).toBe(false);
	});

	it("rejects a projectId that steps outside the worktrees root", () => {
		expect(worktreeDirIsContained(root, "../../passwd")).toBe(false);
	});

	it("allows a path that looks absolute but is joined safely by path.join", () => {
		// path.join(root, "/etc/shadow") on POSIX appends rather than replacing
		// root, so the result stays within the worktrees directory. The real
		// guard against absolute/special ids is the projectIdSchema regex on
		// the tRPC procedure boundary (rejects anything that isn't [a-zA-Z0-9_-]).
		expect(worktreeDirIsContained(root, "/etc/shadow")).toBe(true);
	});
});
