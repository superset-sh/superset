import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
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

	// Fork workflow (#958): `origin` is the user's fork (often behind),
	// `upstream` is the canonical repo. When the base branch only exists as
	// a remote-tracking ref, prefer `upstream/<branch>` over `origin/<branch>`
	// so new work forks from the canonical source, not the stale fork.
	test("prefers upstream remote over origin when both exist (no local branch)", async () => {
		const git = createMockGit(
			new Set(["refs/remotes/upstream/main", "refs/remotes/origin/main"]),
		);
		const result = await resolveStartPoint(git, "main");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.remote).toBe("upstream");
			expect(result.shortName).toBe("main");
			expect(result.fullRef).toBe("refs/remotes/upstream/main");
			expect(result.remoteShortName).toBe("upstream/main");
		}
	});

	test("uses upstream remote-tracking ref when only upstream exists", async () => {
		const git = createMockGit(new Set(["refs/remotes/upstream/feature"]));
		const result = await resolveStartPoint(git, "feature");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.remote).toBe("upstream");
			expect(result.fullRef).toBe("refs/remotes/upstream/feature");
		}
	});

	test("local branch still wins over both upstream and origin", async () => {
		const git = createMockGit(
			new Set([
				"refs/heads/main",
				"refs/remotes/upstream/main",
				"refs/remotes/origin/main",
			]),
		);
		const result = await resolveStartPoint(git, "main");

		expect(result.kind).toBe("local");
		if (result.kind === "local") {
			expect(result.fullRef).toBe("refs/heads/main");
		}
	});
});

// Real-git integration: exercises resolveStartPoint against actual repos with
// `origin` + `upstream` remotes, proving the fork-workflow preference (#958)
// end-to-end rather than against the mocked `raw` shim above.
describe("resolveStartPoint — real git (upstream vs origin)", () => {
	let workRoot: string;

	/** Init a fresh git repo under `workRoot` with a committable identity. */
	function initRepo(name: string): string {
		const repo = join(workRoot, name);
		mkdirSync(repo, { recursive: true });
		execSync("git init -b main", { cwd: repo, stdio: "ignore" });
		execSync('git config user.email "test@superset.local"', {
			cwd: repo,
			stdio: "ignore",
		});
		execSync('git config user.name "Superset Test"', {
			cwd: repo,
			stdio: "ignore",
		});
		execSync("git config commit.gpgsign false", { cwd: repo, stdio: "ignore" });
		return repo;
	}

	/** Write `file` and commit it in `repo`. */
	function commit(repo: string, file: string, body: string, message: string) {
		writeFileSync(join(repo, file), body);
		execSync(`git add ${file}`, { cwd: repo, stdio: "ignore" });
		execSync(`git commit -m "${message}"`, { cwd: repo, stdio: "ignore" });
	}

	/** Full commit SHA of `rev` in `repo`. */
	function sha(repo: string, rev: string): string {
		return execSync(`git rev-parse ${rev}`, {
			cwd: repo,
			encoding: "utf8",
		}).trim();
	}

	beforeEach(() => {
		workRoot = mkdtempSync(join(tmpdir(), "superset-resolve-start-point-"));
	});

	afterEach(() => {
		rmSync(workRoot, { recursive: true, force: true });
	});

	test("forks a non-local branch from upstream, not the stale origin fork", async () => {
		// upstream (canonical) has `shared` at commit U.
		const upstream = initRepo("upstream");
		commit(upstream, "README.md", "base\n", "base");
		execSync("git checkout -b shared", { cwd: upstream, stdio: "ignore" });
		commit(upstream, "shared.txt", "upstream\n", "upstream shared");
		execSync("git checkout main", { cwd: upstream, stdio: "ignore" });

		// origin (the fork) clones upstream, then advances `shared` to commit O.
		execSync(`git clone "${upstream}" origin`, {
			cwd: workRoot,
			stdio: "ignore",
		});
		const origin = join(workRoot, "origin");
		execSync('git config user.email "test@superset.local"', {
			cwd: origin,
			stdio: "ignore",
		});
		execSync('git config user.name "Superset Test"', {
			cwd: origin,
			stdio: "ignore",
		});
		execSync("git checkout shared", { cwd: origin, stdio: "ignore" });
		commit(origin, "shared.txt", "origin fork\n", "origin shared");
		execSync("git checkout main", { cwd: origin, stdio: "ignore" });

		// The working repo clones origin (so `origin/shared` = O) and adds the
		// upstream remote (so `upstream/shared` = U). `shared` is NOT a local
		// branch here — only main is checked out.
		execSync(`git clone "${origin}" clone`, { cwd: workRoot, stdio: "ignore" });
		const clone = join(workRoot, "clone");
		execSync(`git remote add upstream "${upstream}"`, {
			cwd: clone,
			stdio: "ignore",
		});
		execSync("git fetch upstream", { cwd: clone, stdio: "ignore" });

		const git = simpleGit(clone);
		const result = await resolveStartPoint(git, "shared");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.remote).toBe("upstream");
			expect(result.fullRef).toBe("refs/remotes/upstream/shared");
		}

		// e2e proof: the resolved ref points at upstream's commit, not the fork's.
		const resolvedSha = (
			await git.raw(["rev-parse", "refs/remotes/upstream/shared"])
		).trim();
		expect(resolvedSha).toBe(sha(upstream, "shared"));
		expect(resolvedSha).not.toBe(sha(origin, "shared"));
	});

	test("falls back to origin when there is no upstream remote (non-fork repo)", async () => {
		const source = initRepo("source");
		commit(source, "README.md", "base\n", "base");
		execSync("git branch feature", { cwd: source, stdio: "ignore" });

		execSync(`git clone "${source}" clone`, { cwd: workRoot, stdio: "ignore" });
		const clone = join(workRoot, "clone");

		const git = simpleGit(clone);
		const result = await resolveStartPoint(git, "feature");

		expect(result.kind).toBe("remote-tracking");
		if (result.kind === "remote-tracking") {
			expect(result.remote).toBe("origin");
			expect(result.fullRef).toBe("refs/remotes/origin/feature");
		}
	});
});
