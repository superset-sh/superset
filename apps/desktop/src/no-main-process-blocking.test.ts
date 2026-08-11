// Ratchet: keeps blocking work off the Electron main process. Every
// electronTrpc call is served by this one event loop — an in-process git
// spawn or sync fs walk stalls all of them. Git reads belong in the changes
// git worker (src/lib/trpc/routers/changes/workers/).
//
// Counts are per-file matching-line counts, not a file allowlist, so an
// already-listed file cannot silently grow new call sites. Patterns match
// bare identifiers (not just calls) so renamed imports and passed-around
// references count too. Two failure modes, both intentional:
//  - a file exceeds its count → new blocking call site; add a worker task
//    type instead of bumping the number.
//  - a file drops below its count → it was partially or fully fixed;
//    LOWER or DELETE its entry so the ratchet only ever tightens.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname);
const SELF = path.resolve(
	import.meta.dirname,
	"no-main-process-blocking.test.ts",
);

// Main-process code only: lib/trpc routers and main/. The renderer has its
// own thread and the worker dir owns the git primitives.
const SCANNED_DIRS = ["lib", "main"];

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
			// Dead code (no callers) — delete rather than call on main.
			"main/lib/agent-setup/utils.ts": 3,
			// Cold daemon-recovery path only (connect failure / respawn).
			"main/lib/terminal-host/client.ts": 2,
		},
		advice:
			"Sync subprocesses freeze the Electron main process until the child exits — every electronTrpc response and IPC event queues behind it, so the whole app feels hung. Prefer async spawn/execFile: the caller awaits the same result, but main keeps serving while the child runs.",
	},
	{
		name: "sync recursive fs (rmSync/cpSync)",
		pattern: /\b(rmSync|cpSync)\b/,
		allowedCounts: {
			// Workspace-setup copy, cold path.
			"lib/trpc/routers/workspaces/utils/setup.ts": 2,
		},
		advice:
			"rmSync/cpSync walk the whole tree on the Electron main process — a large copy or delete stalls every electronTrpc response for seconds. Prefer `await rm/cp` from node:fs/promises: same result, but the walk runs on libuv's thread pool while main keeps serving.",
	},
	{
		name: "in-process git client construction",
		pattern: /\b(simpleGit|getSimpleGitWithShellPath)\b/,
		allowedCounts: {
			// The factory module itself — permanent entry.
			"lib/trpc/routers/workspaces/utils/git-client.ts": 4,
			// Legacy on-main git spawners — shrink these counts by porting reads
			// to worker task types (changes/workers/git-task-types.ts).
			"lib/trpc/routers/changes/git-operations.ts": 2,
			"lib/trpc/routers/changes/security/git-commands.ts": 2,
			"lib/trpc/routers/changes/staging.ts": 3,
			"lib/trpc/routers/projects/projects.ts": 6,
			"lib/trpc/routers/workspaces/utils/base-branch-config.ts": 4,
			"lib/trpc/routers/workspaces/utils/git.ts": 21,
		},
		advice:
			"simple-git is async, but a client constructed here still pays the spawn syscall + stdout drain on the Electron main process — cost scales linearly with call volume (branch polls, sidebar rows). Async isn't enough for git; route it off-process: add a task type to changes/workers/git-task-types.ts and run it via runGitTask.",
	},
];

// Prefix, not dirname-suffix: nested subdirectories of the worker dir are
// worker code too.
const EXEMPT_DIR_PREFIXES = ["lib/trpc/routers/changes/workers/"];
const EXEMPT_FILE_PATTERNS = [/\.test\.tsx?$/, /(^|\/)test-helpers\.ts$/];

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
		if (!entry.isFile()) continue;
		if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) continue;
		if (full === SELF) continue;
		yield full;
	}
}

function relevantFiles(): string[] {
	const files: string[] = [];
	for (const scanned of SCANNED_DIRS) {
		const root = path.join(SRC_DIR, scanned);
		if (!fs.existsSync(root)) continue;
		for (const file of walk(root)) {
			// Forward slashes so allowlists match on Windows too.
			const rel = path.relative(SRC_DIR, file).split(path.sep).join("/");
			if (EXEMPT_DIR_PREFIXES.some((prefix) => rel.startsWith(prefix)))
				continue;
			if (EXEMPT_FILE_PATTERNS.some((pattern) => pattern.test(rel))) continue;
			files.push(rel);
		}
	}
	return files;
}

describe("no new main-process blocking call sites", () => {
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
