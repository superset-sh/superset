import { describe, expect, mock, test } from "bun:test";
import { resolveStartPoint } from "./resolve-start-point";

/**
 * Mock git that knows about a set of FULL refnames (e.g. `refs/heads/main`,
 * `refs/remotes/origin/main`). Mirrors how `resolveStartPoint` probes.
 */
function createMockGit(existingFullRefs: Set<string>, defaultBranch?: string) {
	return {
		raw: mock(async (args: string[]) => {
			if (args[0] === "rev-parse" && args[1] === "--verify") {
				const ref = args[2]?.replace("^{commit}", "") ?? "";
				if (existingFullRefs.has(ref)) {
					return `${"0".repeat(40)}\n`;
				}
				throw new Error("fatal: Needed a single revision");
			}
			if (
				args[0] === "symbolic-ref" &&
				args[1] === "refs/remotes/origin/HEAD"
			) {
				if (defaultBranch) return `origin/${defaultBranch}`;
				throw new Error(
					"fatal: ref refs/remotes/origin/HEAD is not a symbolic ref",
				);
			}
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
	} as never;
}

describe("resolveStartPoint", () => {
	test("prefers local branch when it exists (even if origin/<branch> also exists)", async () => {
		// User picked a branch from a list of refs they can see — fork from
		// the local state, not a possibly-stale remote ref.
		const git = createMockGit(
			new Set(["refs/remotes/origin/main", "refs/heads/main"]),
		);
		const result = await resolveStartPoint(git, "main");

		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.shortName).toBe("main");
			expect(result.fullRef).toBe("refs/heads/main");
		}
	});

	test("falls back to remote-tracking when local doesn't exist", async () => {
		const git = createMockGit(new Set(["refs/remotes/origin/main"]));
		const result = await resolveStartPoint(git, "main");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.shortName).toBe("main");
			expect(result.remote).toBe("origin");
			expect(result.fullRef).toBe("refs/remotes/origin/main");
		}
	});

	test("returns local for a local-only branch (e.g. workspace branch)", async () => {
		const git = createMockGit(new Set(["refs/heads/main"]));
		const result = await resolveStartPoint(git, "main");

		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.shortName).toBe("main");
		}
	});

	// Regression: workspace branches like `agreeable-ermine` exist locally
	// only. A stale `refs/remotes/origin/agreeable-ermine` cached ref must
	// not win — `git worktree add ... origin/agreeable-ermine` would fail
	// with "invalid reference" if the remote ref doesn't actually resolve.
	test("workspace-style branch (local + stale remote cache) prefers local", async () => {
		const git = createMockGit(
			new Set([
				"refs/heads/agreeable-ermine",
				"refs/remotes/origin/agreeable-ermine",
			]),
		);
		const result = await resolveStartPoint(git, "agreeable-ermine");

		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.shortName).toBe("agreeable-ermine");
		}
	});

	test("falls back to HEAD when neither exists", async () => {
		const git = createMockGit(new Set());
		const result = await resolveStartPoint(git, "main");

		expect(result.kind).toBe("head");
	});

	test("works with explicit branch name", async () => {
		const git = createMockGit(
			new Set(["refs/remotes/origin/develop", "refs/heads/develop"]),
		);
		const result = await resolveStartPoint(git, "develop");

		// Local-first.
		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.shortName).toBe("develop");
		}
	});

	test("resolves default branch via symbolic-ref when baseBranch not provided", async () => {
		const git = createMockGit(
			new Set(["refs/remotes/origin/master", "refs/heads/master"]),
			"master",
		);
		const result = await resolveStartPoint(git, undefined);

		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.shortName).toBe("master");
		}
	});

	test("defaults to 'main' when symbolic-ref fails and baseBranch not provided", async () => {
		const git = createMockGit(new Set(["refs/remotes/origin/main"]));
		const result = await resolveStartPoint(git, undefined);

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.shortName).toBe("main");
		}
	});

	test("falls back to HEAD when symbolic-ref fails and no default branch exists", async () => {
		const git = createMockGit(new Set());
		const result = await resolveStartPoint(git, undefined);

		expect(result.kind).toBe("head");
	});

	test("handles empty/whitespace baseBranch as undefined", async () => {
		const git = createMockGit(new Set(["refs/remotes/origin/main"]));
		const result = await resolveStartPoint(git, "  ");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.shortName).toBe("main");
		}
	});

	// Regression: a local branch literally named `origin/foo` must classify
	// as `local`, not `remote-tracking`. Previously `ref.startsWith("origin/")`
	// got this wrong.
	test("local branch named origin/foo classifies as local, not remote-tracking", async () => {
		const git = createMockGit(new Set(["refs/heads/origin/foo"]));
		const result = await resolveStartPoint(git, "origin/foo");

		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.shortName).toBe("origin/foo");
			expect(result.fullRef).toBe("refs/heads/origin/foo");
		}
	});
});
