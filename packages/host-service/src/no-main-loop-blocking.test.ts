// Ratchet: keeps blocking work off the host-service event loop. One slow
// in-process git spawn (or a sync fs walk) head-of-line blocks every tRPC
// response this process serves. Git subprocess work belongs in the worker
// pool (src/workers/) — see workers/tasks/git.ts for the pattern.
//
// Counts are per-file matching-line counts, not a file allowlist, so an
// already-listed file cannot silently grow new call sites. Patterns match
// bare identifiers (not just calls) so renamed imports and passed-around
// references count too. Two failure modes, both intentional:
//  - a file exceeds its count → new blocking call site; route it through
//    the worker pool (or async fs) instead of bumping the number.
//  - a file drops below its count → it was partially or fully fixed;
//    LOWER or DELETE its entry so the ratchet only ever tightens.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname);
const SELF = path.resolve(import.meta.dirname, "no-main-loop-blocking.test.ts");

interface Rule {
	name: string;
	pattern: RegExp;
	/** Repo-relative (from src/) file → exact matching-line count allowed. */
	allowedCounts: Record<string, number>;
	advice: string;
}

const RULES: Rule[] = [
	{
		name: "sync subprocess (execSync/spawnSync/execFileSync)",
		pattern: /\b(execSync|spawnSync|execFileSync)\b/,
		allowedCounts: {
			// Reads a shell-configured credential command at provider init.
			"providers/model-providers/LocalModelProvider/utils/resolveAnthropicCredential.ts": 2,
		},
		advice:
			"Sync subprocesses freeze this org's only event loop until the child exits — every tRPC response, status poll, and watcher callback queues behind it. Prefer async spawn/execFile: the caller awaits the same result, but the loop keeps serving while the child runs. Git reads belong in a worker task (workers/tasks/git.ts via getHostWorkerPool()).",
	},
	{
		name: "sync recursive fs (rmSync/cpSync)",
		pattern: /\b(rmSync|cpSync)\b/,
		allowedCounts: {
			// Bounded: single attachment files, not repo trees.
			"trpc/router/attachments/storage.ts": 2,
		},
		advice:
			"rmSync/cpSync walk the whole tree on the event loop — deleting a large worktree stalls every response for seconds. Prefer `await rm/cp` from node:fs/promises: same result, but the walk runs on libuv's thread pool while the loop keeps serving.",
	},
	{
		name: "in-process git client construction",
		pattern: /\b(createUserSimpleGit|simpleGit)\b/,
		allowedCounts: {
			// Legacy on-loop git spawners — shrink these counts by porting call
			// sites to worker tasks (workers/tasks/git.ts).
			"trpc/router/git/git.ts": 2,
			"trpc/router/git/utils/git-helpers.ts": 2,
			"trpc/router/project/project.ts": 2,
			"trpc/router/project/utils/resolve-repo.ts": 10,
			"trpc/router/workspace-creation/shared/project-helpers.ts": 3,
		},
		advice:
			"simple-git is async, but a client constructed here still pays the spawn syscall + stdout drain on the event loop — cost scales linearly with call volume (measured ~830ms/min at light churn). Async isn't enough for git; route it off-loop: add a task to workers/tasks/git.ts and expose it with an offLoop() resolver (src/trpc/off-loop.ts).",
	},
	{
		name: "on-loop git via the ctx.git() shared factory",
		pattern: /\b(ctx|context)\.git\b/,
		allowedCounts: {
			// Legacy ctx.git() consumers — previously invisible to every
			// enforcement layer (the client is constructed inside the exempt
			// runtime/git/). Shrink by porting to worker tasks: resolve env
			// on-loop with createGitEnvResolver, run the git work in the pool
			// (see workspace-cleanup/git-ops.ts for the pattern).
			"trpc/router/git/git.ts": 12,
			"trpc/router/project/project.ts": 1,
			"trpc/router/project/utils/ensure-main-workspace.ts": 1,
			"trpc/router/workspace-creation/procedures/adopt.ts": 1,
			"trpc/router/workspace-creation/procedures/list-project-worktrees.ts": 1,
			"trpc/router/workspace-creation/procedures/search-branches.ts": 1,
			"trpc/router/workspace-creation/utils/ai-workspace-names.ts": 1,
			"trpc/router/workspace-creation/utils/list-branch-names.ts": 1,
			"trpc/router/workspace/workspace.ts": 1,
			"trpc/router/workspaces/workspaces.ts": 1,
		},
		advice:
			"ctx.git() hands back an on-loop client — every call spawns and drains git on the event loop, and the ratchet's other rules can't see it. Resolve the env on-loop (createGitEnvResolver) and run the git work as a worker task instead (workers/tasks/git.ts; see workspace-cleanup/git-ops.ts). The pattern only matches direct property access — don't dodge it by destructuring/aliasing the factory off the context.",
	},
];

// The worker pool and the git runtime own the primitives the rules police;
// tests (bun + node-test) may do whatever they need.
const EXEMPT_DIR_PREFIXES = ["workers/", "runtime/git/"];
const EXEMPT_FILE_PATTERNS = [/\.test\.ts$/, /\.node-test\.ts$/];

/**
 * Matching lines after comment stripping — prose mentions don't count.
 * Line-comment stripping is naive (`//` inside a string truncates the rest
 * of that line), which can only under-count, never false-positive.
 */
function countMatchingLines(contents: string, pattern: RegExp): number {
	const stripped = contents.replace(/\/\*[\s\S]*?\*\//g, "");
	let count = 0;
	for (const line of stripped.split("\n")) {
		if (pattern.test(line.replace(/\/\/.*$/, ""))) count++;
	}
	return count;
}

function* walk(dir: string): Generator<string> {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") continue;
			yield* walk(full);
			continue;
		}
		if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
		if (full === SELF) continue;
		yield full;
	}
}

function relevantFiles(): string[] {
	const files: string[] = [];
	for (const file of walk(SRC_DIR)) {
		// Forward slashes so allowlists match on Windows too.
		const rel = path.relative(SRC_DIR, file).split(path.sep).join("/");
		if (EXEMPT_DIR_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
		if (EXEMPT_FILE_PATTERNS.some((pattern) => pattern.test(rel))) continue;
		files.push(rel);
	}
	return files;
}

describe("no new main-loop blocking call sites", () => {
	const files = relevantFiles();

	for (const rule of RULES) {
		test(rule.name, () => {
			const counts = new Map<string, number>();
			for (const rel of files) {
				const contents = fs.readFileSync(path.join(SRC_DIR, rel), "utf-8");
				const count = countMatchingLines(contents, rule.pattern);
				if (count > 0) counts.set(rel, count);
			}

			const offenders = [...counts]
				.filter(([rel, count]) => count > (rule.allowedCounts[rel] ?? 0))
				.map(
					([rel, count]) =>
						`${rel} (${count} > ${rule.allowedCounts[rel] ?? 0})`,
				)
				.sort();
			expect(offenders, `New blocking call site(s). ${rule.advice}`).toEqual(
				[],
			);

			const stale = Object.entries(rule.allowedCounts)
				.filter(([rel, allowed]) => (counts.get(rel) ?? 0) < allowed)
				.map(
					([rel, allowed]) => `${rel} (${counts.get(rel) ?? 0} < ${allowed})`,
				)
				.sort();
			expect(
				stale,
				"Allowlisted count(s) too high — lower or delete them in allowedCounts so the ratchet tightens.",
			).toEqual([]);
		});
	}
});
