// Ratchet: src/server/desktop is imported by the Electron main process (the
// desktop chat-service / chat-runtime-service tRPC routers), so blocking
// calls here stall every electronTrpc response — the desktop app's own
// no-main-process-blocking ratchet cannot see across the package boundary.
//
// Counts are per-file matching-line counts, not a file allowlist, so an
// already-listed file cannot silently grow new call sites. Patterns match
// bare identifiers (not just calls) so renamed imports and passed-around
// references count too. Two failure modes, both intentional:
//  - a file exceeds its count → new blocking call site; make it async (or
//    move it off the main process) instead of bumping the number.
//  - a file drops below its count → it was partially or fully fixed;
//    LOWER or DELETE its entry so the ratchet only ever tightens.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname);
const SELF = path.resolve(
	import.meta.dirname,
	"no-desktop-main-blocking.test.ts",
);

interface Rule {
	name: string;
	pattern: RegExp;
	/** Repo-relative (from server/desktop/) file → matching-line count allowed. */
	allowedCounts: Record<string, number>;
	advice: string;
}

const RULES: Rule[] = [
	{
		name: "sync subprocess (execSync/spawnSync/execFileSync)",
		pattern: /\b(execSync|spawnSync|execFileSync)\b/,
		allowedCounts: {
			// Keychain `security` reads in the sync credential-resolver chain —
			// each spawn blocks Electron main. Port to the async resolvers.
			"auth/anthropic/anthropic.ts": 3,
		},
		advice:
			"This code runs on the Electron main process: a sync subprocess freezes it until the child exits, so every electronTrpc response and IPC event queues behind it. Prefer async spawn/execFile: the caller awaits the same result, but main keeps serving while the child runs.",
	},
	{
		name: "sync recursive fs (rmSync/cpSync)",
		pattern: /\b(rmSync|cpSync)\b/,
		allowedCounts: {
			// Single config file, not a tree walk.
			"chat-service/anthropic-env-config.ts": 2,
		},
		advice:
			"rmSync/cpSync walk the whole tree on the Electron main process — a large copy or delete stalls every electronTrpc response for seconds. Prefer `await rm/cp` from node:fs/promises: same result, but the walk runs on libuv's thread pool while main keeps serving.",
	},
	{
		name: "in-process git client construction",
		pattern: /\b(simpleGit|getSimpleGitWithShellPath)\b/,
		allowedCounts: {},
		advice:
			"simple-git is async, but a client constructed here still pays the spawn syscall + stdout drain on the Electron main process. Async isn't enough for git; use the desktop changes git worker (runGitTask) instead.",
	},
];

const EXEMPT_FILE_PATTERNS = [/\.test\.tsx?$/];

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
	for (const file of walk(SRC_DIR)) {
		// Forward slashes so allowlists match on Windows too.
		const rel = path.relative(SRC_DIR, file).split(path.sep).join("/");
		if (EXEMPT_FILE_PATTERNS.some((pattern) => pattern.test(rel))) continue;
		files.push(rel);
	}
	return files;
}

describe("no new desktop-main blocking call sites in chat server", () => {
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
