// Ratchet: keeps blocking work off the Electron main process. Every
// electronTrpc call is served by this one event loop — an in-process git
// spawn or sync fs walk stalls all of them. Git reads belong in the changes
// git worker (src/lib/trpc/routers/changes/workers/).
//
// Two failure modes, both intentional:
//  - a NON-allowlisted file matches → new blocking call site; add a worker
//    task type instead of extending the list.
//  - an allowlisted file stops matching → it was fixed; DELETE its entry so
//    the ratchet only ever tightens.

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
	allowedFiles: string[];
	advice: string;
}

const RULES: Rule[] = [
	{
		name: "sync subprocess (execSync/spawnSync/execFileSync)",
		pattern: /\b(execSync|spawnSync|execFileSync)\s*\(/,
		allowedFiles: [
			// Dead code (no callers) — delete rather than call on main.
			"main/lib/agent-setup/utils.ts",
			// Cold daemon-recovery path only (connect failure / respawn).
			"main/lib/terminal-host/client.ts",
		],
		advice:
			"Sync subprocesses hard-block the main process for their full runtime. Use async spawn/execFile.",
	},
	{
		name: "sync recursive fs (rmSync/cpSync)",
		pattern: /\b(rmSync|cpSync)\s*\(/,
		allowedFiles: [
			// Workspace-setup copy, cold path.
			"lib/trpc/routers/workspaces/utils/setup.ts",
		],
		advice:
			"Recursive sync fs walks block the main process for the whole tree. Use `await rm/cp` from node:fs/promises.",
	},
	{
		name: "in-process git client construction",
		pattern: /\b(simpleGit|getSimpleGitWithShellPath)\s*\(/,
		allowedFiles: [
			// The factory module itself — permanent entry.
			"lib/trpc/routers/workspaces/utils/git-client.ts",
			// Legacy on-main git spawners — shrink this list by porting reads
			// to worker task types (changes/workers/git-task-types.ts).
			"lib/trpc/routers/changes/git-operations.ts",
			"lib/trpc/routers/changes/security/git-commands.ts",
			"lib/trpc/routers/changes/staging.ts",
			"lib/trpc/routers/projects/projects.ts",
			"lib/trpc/routers/workspaces/utils/base-branch-config.ts",
			"lib/trpc/routers/workspaces/utils/git.ts",
		],
		advice:
			"Constructing a git client here runs the subprocess spawn + stdout drain on the Electron main process. Add a task type to changes/workers/ and route through runGitTask.",
	},
];

// Prefix, not dirname-suffix: nested subdirectories of the worker dir are
// worker code too.
const EXEMPT_DIR_PREFIXES = ["lib/trpc/routers/changes/workers/"];
const EXEMPT_FILE_PATTERNS = [/\.test\.tsx?$/, /(^|\/)test-helpers\.ts$/];

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
			const matched = new Set<string>();
			const offenders: string[] = [];

			for (const rel of files) {
				const contents = fs.readFileSync(path.join(SRC_DIR, rel), "utf-8");
				if (!rule.pattern.test(contents)) continue;
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
