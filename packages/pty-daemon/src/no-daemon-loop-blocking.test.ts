// Ratchet: the pty-daemon is one long-lived event loop serving every
// terminal session in the org — a sync spawn or fs walk here stalls all
// PTY IO at once. The existing spawnSync sites are deliberate (the kill
// chain and shutdown drain want bounded sync semantics; the hot
// exit-detection path already uses readProcessTableAsync) — this test
// freezes them so new ones don't creep in.
//
// Counts are per-file matching-line counts, not a file allowlist, so an
// already-listed file cannot silently grow new call sites. Patterns match
// bare identifiers (not just calls) so renamed imports and passed-around
// references count too. Two failure modes, both intentional:
//  - a file exceeds its count → new blocking call site; use the async
//    variants instead of bumping the number.
//  - a file drops below its count → it was partially or fully fixed;
//    LOWER or DELETE its entry so the ratchet only ever tightens.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname);
const SELF = path.resolve(
	import.meta.dirname,
	"no-daemon-loop-blocking.test.ts",
);

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
			// Shell probe + shutdown diagnostics; cold paths.
			"Pty/Pty.ts": 2,
			// Kill-chain ps reads — bounded by PS_TIMEOUT_MS; the hot polling
			// path uses readProcessTableAsync instead.
			"process-tree.ts": 3,
		},
		advice:
			"A sync subprocess freezes the daemon's only event loop until the child exits — every terminal session in the org stops flowing (keystrokes and output stall). Prefer async spawn/execFile (see readProcessTableAsync): the caller awaits the same result, but session IO keeps flowing while the child runs.",
	},
	{
		name: "sync recursive fs (rmSync/cpSync)",
		pattern: /\b(rmSync|cpSync)\b/,
		allowedCounts: {},
		advice:
			"rmSync/cpSync walk the whole tree on the daemon loop — every terminal session's IO stalls for the duration. Prefer `await rm/cp` from node:fs/promises: same result, but the walk runs on libuv's thread pool while session IO keeps flowing.",
	},
];

const EXEMPT_FILE_PATTERNS = [/\.test\.ts$/];

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
		if (EXEMPT_FILE_PATTERNS.some((pattern) => pattern.test(rel))) continue;
		files.push(rel);
	}
	return files;
}

describe("no new daemon-loop blocking call sites", () => {
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
