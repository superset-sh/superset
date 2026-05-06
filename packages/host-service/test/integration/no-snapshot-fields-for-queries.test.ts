import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { relative, resolve } from "node:path";

/**
 * Hardening guard: GitHub queries (octokit, gh, graphql) must derive
 * `owner`/`name` from the live local git remote — i.e. via
 * `resolveGithubRepo(ctx, projectId)` — never from the cloud
 * `repoCloneUrl` snapshot or the cached `projects.repoOwner`/`repoName`
 * columns. Those drift on rename/fork/manual remote re-point and produce
 * silent misrouting of queries to the wrong repo.
 *
 * This test scans `packages/host-service/src/**` for member reads of those
 * fields. The allowlist below is for files that legitimately reference
 * them: schema declarations, the setup pipeline (cloning, persistence),
 * the resolver itself, and display-only project listing.
 *
 * If you're adding a new GitHub query and reach for one of these fields
 * to satisfy this test — STOP. Call `resolveGithubRepo(ctx, projectId)`
 * instead. The allowlist is for snapshot consumers, not query consumers.
 */
const HOST_SERVICE_SRC = resolve(import.meta.dir, "../../src");

const ALLOWLIST = new Set([
	// Schema declarations — these literally define the columns.
	"db/schema.ts",

	// Setup pipeline. Cloning needs the cloud `repoCloneUrl` to know what
	// to pass to `git clone`; the local cache columns are written here.
	"trpc/router/project/handlers.ts",
	"trpc/router/project/project.ts",
	"trpc/router/project/utils/persist-project.ts",

	// The resolver itself. Mentions the field names in JSDoc; doesn't read
	// them off any object — see the regex below, which only flags member
	// access. Listed here defensively in case a future edit introduces one.
	"trpc/router/workspace-creation/shared/project-helpers.ts",

	// The PR-runtime poller still uses cached `project.repoOwner`/`repoName`
	// for its repo identity. Migrating it to the live remote is a separate
	// change because the cache has TTL/invalidation semantics that need
	// rethinking. TODO: route this through `resolveGithubRepo` and have the
	// runtime react to `.git/config` changes via GitWatcher.
	"runtime/pull-requests/pull-requests.ts",

	// `git.getPullRequestSidebar` echoes the cached `pull_requests` row's
	// `repoOwner`/`repoName` back to the renderer alongside the PR list. It
	// isn't constructing a new GitHub query directly, but it forwards the
	// snapshot. TODO: drop these fields from the response shape, or derive
	// them from `resolveGithubRepo` once per render. (Keep this allowlisted
	// only as long as the rest of the file uses `resolveGithubRepo` for any
	// actual querying — see `getPullRequestThreads` above for the pattern.)
	"trpc/router/git/git.ts",
]);

// Match member-access reads of the snapshot fields. Catches both bare
// identifiers (`cloudProject.repoCloneUrl`) and chained-call expressions
// (`get.query().repoCloneUrl`). Skips bare object-literal writes
// (`{ repoCloneUrl: … }`) since those don't have a leading `.`.
const FORBIDDEN = /\.(repoCloneUrl|repoOwner|repoName)\b/;

test("snapshot fields aren't read for GitHub queries outside the allowlist", async () => {
	const violations: Array<{ file: string; line: number; text: string }> = [];

	for await (const file of glob("**/*.ts", { cwd: HOST_SERVICE_SRC })) {
		const rel = file;
		// Test files exist to verify implementation behavior; they routinely
		// assert on cached fields. The rule applies to production code paths.
		if (rel.endsWith(".test.ts")) continue;
		if (ALLOWLIST.has(rel)) continue;

		const abs = resolve(HOST_SERVICE_SRC, rel);
		const content = readFileSync(abs, "utf8");
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// Skip comment lines so JSDoc/explanatory comments don't trip
			// the guard. Block comments aren't worth tracking precisely;
			// the trailing `//` in a code line is rare enough.
			const trimmed = line.trimStart();
			if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
			if (FORBIDDEN.test(line)) {
				violations.push({ file: rel, line: i + 1, text: line.trim() });
			}
		}
	}

	if (violations.length > 0) {
		const report = violations
			.map((v) => `  ${v.file}:${v.line}  ${v.text}`)
			.join("\n");
		throw new Error(
			[
				"Found snapshot-field reads outside the allowlist.",
				"",
				"GitHub queries must call `resolveGithubRepo(ctx, projectId)` to",
				"get owner/name from the live local git remote — not from the",
				"cached/cloud snapshot fields below:",
				"",
				report,
				"",
				`See ${relative(process.cwd(), import.meta.path)} for the rule.`,
			].join("\n"),
		);
	}

	expect(violations).toEqual([]);
});
