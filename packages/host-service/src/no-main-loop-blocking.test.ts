// Ratchet: keeps blocking work off the host-service event loop. One slow
// in-process git spawn (or a sync fs walk) head-of-line blocks every tRPC
// response this process serves. Git subprocess work belongs in the worker
// pool (src/workers/) — see workers/tasks/git.ts for the pattern.
//
// Two failure modes, both intentional:
//  - a NON-allowlisted file matches → new blocking call site; route it
//    through the worker pool (or async fs) instead of extending the list.
//  - an allowlisted file stops matching → it was fixed; DELETE its entry so
//    the ratchet only ever tightens.

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC_DIR = path.resolve(import.meta.dirname);
const SELF = path.resolve(import.meta.dirname, "no-main-loop-blocking.test.ts");

interface Rule {
	name: string;
	pattern: RegExp;
	/** Line-level escape: lines matching this are not violations. */
	allowLine?: RegExp;
	/** Repo-relative (from src/) files allowed to match — the ratchet. */
	allowedFiles: string[];
	advice: string;
}

const RULES: Rule[] = [
	{
		name: "sync subprocess (execSync/spawnSync/execFileSync)",
		pattern: /\b(execSync|spawnSync|execFileSync)\s*\(/,
		allowedFiles: [
			// Reads a shell-configured credential command at provider init.
			"providers/model-providers/LocalModelProvider/utils/resolveAnthropicCredential.ts",
		],
		advice:
			"Sync subprocesses hard-block the event loop for their full runtime. Use async exec/spawn, or a worker task for git.",
	},
	{
		name: "sync recursive fs (rmSync/cpSync)",
		pattern: /\b(rmSync|cpSync)\s*\(/,
		allowedFiles: [
			// Bounded: single attachment files, not repo trees.
			"trpc/router/attachments/storage.ts",
		],
		advice:
			"Recursive sync fs walks block the loop for the whole tree. Use `await rm/cp` from node:fs/promises.",
	},
	{
		name: "in-process git client construction",
		pattern: /\b(createUserSimpleGit|simpleGit)\s*\(/,
		allowedFiles: [
			// Legacy on-loop git spawners — shrink this list by porting call
			// sites to worker tasks (workers/tasks/git.ts).
			"trpc/router/git/git.ts",
			"trpc/router/git/utils/git-helpers.ts",
			"trpc/router/project/project.ts",
			"trpc/router/project/utils/resolve-repo.ts",
			"trpc/router/settings/branch-prefix.ts",
			"trpc/router/workspace-creation/shared/project-helpers.ts",
		],
		advice:
			"Constructing a git client here runs the subprocess spawn + stdout drain on the event loop. Add a task to workers/tasks/git.ts and run it via getHostWorkerPool().",
	},
];

// The worker pool and the git runtime own the primitives the rules police;
// tests (bun + node-test) may do whatever they need.
const EXEMPT_DIR_PREFIXES = ["workers/", "runtime/git/"];
const EXEMPT_FILE_PATTERNS = [/\.test\.ts$/, /\.node-test\.ts$/];

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
			const matched = new Set<string>();
			const offenders: string[] = [];

			for (const rel of files) {
				const contents = fs.readFileSync(path.join(SRC_DIR, rel), "utf-8");
				const lines = contents.split("\n");
				const hit = lines.some(
					(line) => rule.pattern.test(line) && !rule.allowLine?.test(line),
				);
				if (!hit) continue;
				matched.add(rel);
				if (!rule.allowedFiles.includes(rel)) offenders.push(rel);
			}

			expect(offenders, `New blocking call site(s). ${rule.advice}`).toEqual(
				[],
			);

			const stale = rule.allowedFiles.filter((rel) => !matched.has(rel));
			expect(
				stale,
				"Allowlisted file(s) no longer match — remove them from allowedFiles so the ratchet tightens.",
			).toEqual([]);
		});
	}
});
