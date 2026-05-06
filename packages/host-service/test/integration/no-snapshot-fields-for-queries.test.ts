import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { glob } from "node:fs/promises";
import { relative, resolve } from "node:path";

/**
 * Hardening guard. GitHub queries must derive owner/name from the live
 * local remote via `resolveGithubRepo(ctx, projectId)` — never from cloud
 * `repoCloneUrl` or cached `projects.repoOwner`/`repoName`, which drift on
 * rename/fork/remote re-point and silently misroute queries.
 *
 * If a new query trips this test: don't add to the allowlist. Call
 * `resolveGithubRepo` instead. The allowlist is for snapshot consumers
 * (schema, setup pipeline, persistence), not query consumers.
 */
const HOST_SERVICE_SRC = resolve(import.meta.dir, "../../src");

const ALLOWLIST = new Set([
	// Schema and setup pipeline — declares the columns and writes them.
	"db/schema.ts",
	"trpc/router/project/handlers.ts",
	"trpc/router/project/project.ts",
	"trpc/router/project/utils/persist-project.ts",

	// Resolver itself: mentions field names in JSDoc, no member reads.
	"trpc/router/workspace-creation/shared/project-helpers.ts",

	// TODO: PR-runtime poller still keys repo identity off cached
	// `project.repoOwner`/`repoName`. Migration needs cache invalidation
	// rethink (GitWatcher → bust on `.git/config` changes).
	"runtime/pull-requests/pull-requests.ts",

	// TODO: `git.getPullRequestSidebar` forwards cached `pull_requests.repoOwner`/
	// `repoName` to the renderer. Either drop from the response shape or
	// derive via `resolveGithubRepo` per render.
	"trpc/router/git/git.ts",
]);

// Member-access reads only — `cloudProject.repoCloneUrl` and
// `get.query().repoCloneUrl` both match; `{ repoCloneUrl: … }` doesn't.
const FORBIDDEN = /\.(repoCloneUrl|repoOwner|repoName)\b/;

test("snapshot fields aren't read for GitHub queries outside the allowlist", async () => {
	const violations: Array<{ file: string; line: number; text: string }> = [];

	for await (const file of glob("**/*.ts", { cwd: HOST_SERVICE_SRC })) {
		const rel = file;
		// Tests routinely assert on cached fields; rule is for production code.
		if (rel.endsWith(".test.ts")) continue;
		if (ALLOWLIST.has(rel)) continue;

		const abs = resolve(HOST_SERVICE_SRC, rel);
		const content = readFileSync(abs, "utf8");
		const lines = content.split("\n");
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			// Skip comments so JSDoc explaining the rule doesn't self-trip.
			// Block comments tracked by leading delimiter; doesn't perfectly
			// cover mid-line `/* */` but that's vanishingly rare here.
			const trimmed = line.trimStart();
			if (
				trimmed.startsWith("//") ||
				trimmed.startsWith("*") ||
				trimmed.startsWith("/*")
			) {
				continue;
			}
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
