import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { claudeProjectDirName } from "../../terminal-agents/harness-sessions/claude.ts";
import { HostWorkerPool } from "../host-worker-pool.ts";
import {
	harnessTasks,
	harnessTranscriptTask,
	inspectSavedConversationTask,
} from "./harness.ts";

const WORKER_ENTRY = path.resolve(import.meta.dirname, "..", "host-worker.ts");
const NATIVE_MODULES = ["better-sqlite3", "node-pty", "@parcel/watcher"];

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
	for (const fn of cleanup.splice(0)) await fn();
});

/** Every module the task loads, following relative imports from its entry. */
function importGraph(entry: string): Map<string, string[]> {
	const graph = new Map<string, string[]>();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop() as string;
		if (graph.has(file)) continue;
		const specifiers = [
			...readFileSync(file, "utf8").matchAll(
				/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gms,
			),
		]
			.filter((match) => !match[0].match(/^\s*(?:import|export)\s+type\s/))
			.map((match) => match[1] as string);
		graph.set(file, specifiers);
		for (const specifier of specifiers) {
			if (!specifier.startsWith(".")) continue;
			const resolved = path.resolve(path.dirname(file), specifier);
			pending.push(resolved.endsWith(".ts") ? resolved : `${resolved}.ts`);
		}
	}
	return graph;
}

describe("harness worker tasks", () => {
	test("registers every task and has no duplicate types", () => {
		expect(harnessTasks).toContain(harnessTranscriptTask);
		expect(harnessTasks).toContain(inspectSavedConversationTask);
		const types = harnessTasks.map((task) => task.type);
		expect(types).toEqual([...new Set(types)]);
	});

	test("loads no native module into the worker", () => {
		// Native addons are external to the worker bundle; OpenCode's SQLite
		// store belongs on the event loop, never in this graph.
		const offenders = [
			...importGraph(path.resolve(import.meta.dirname, "harness.ts")),
		].flatMap(([file, specifiers]) =>
			specifiers
				.filter((specifier) => NATIVE_MODULES.includes(specifier))
				.map((specifier) => `${path.basename(file)} → ${specifier}`),
		);
		expect(offenders).toEqual([]);
	});

	test("reads a Claude session on a worker thread", async () => {
		const configDir = mkdtempSync(path.join(tmpdir(), "harness-task-"));
		cleanup.push(() => rmSync(configDir, { recursive: true, force: true }));
		const sessionId = "55555555-6666-4777-8888-999900001111";
		const dir = path.join(
			configDir,
			"projects",
			claudeProjectDirName("/work/tree"),
		);
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			path.join(dir, `${sessionId}.jsonl`),
			`${JSON.stringify({ type: "user", message: { role: "user", content: "off the loop" } })}\n`,
		);
		const pool = new HostWorkerPool({ scriptPathResolver: () => WORKER_ENTRY });
		cleanup.push(() => pool.dispose());

		const result = await pool.run(harnessTranscriptTask, {
			ref: {
				agentId: "claude",
				sessionId,
				worktreePath: "/work/tree",
				env: { CLAUDE_CONFIG_DIR: configDir },
			},
			maxChars: 36_000,
		});

		expect(result).toEqual({ text: "User: off the loop", harness: "claude" });
	});
});

test("saved-history worker returns only stable identity evidence and refuses invalid history", async () => {
	const temporary = mkdtempSync(path.join(tmpdir(), "saved-history-task-"));
	cleanup.push(() => rmSync(temporary, { recursive: true, force: true }));
	const configDir = realpathSync(temporary);
	const cwd = path.join(configDir, "workspace");
	mkdirSync(cwd);
	const sessionId = "55555555-6666-4777-8888-999900001111";
	const directory = path.join(configDir, "projects", claudeProjectDirName(cwd));
	mkdirSync(directory, { recursive: true });
	const file = path.join(directory, `${sessionId}.jsonl`);
	const content = `${JSON.stringify({ type: "user", sessionId, cwd, uuid: "11111111-2222-4333-8444-555555555555", message: { role: "user", content: "synthetic worker validation" } })}\n`;
	writeFileSync(file, content);
	const pool = new HostWorkerPool({ scriptPathResolver: () => WORKER_ENTRY });
	cleanup.push(() => pool.dispose());
	const input = {
		provider: "claude" as const,
		sourceDirectory: configDir,
		targetDirectory: configDir,
		sessionId,
		cwd,
	};
	const workerOnlyTask: typeof inspectSavedConversationTask = {
		...inspectSavedConversationTask,
		handler: async (): Promise<never> => {
			throw new Error("This fixture must not run inline");
		},
	};
	expect(pool.getMode()).toBe("worker");
	const result = await pool.run(workerOnlyTask, input);
	expect(result).toEqual({
		path: file,
		device: expect.any(Number),
		inode: expect.any(Number),
		size: Buffer.byteLength(content),
		modifiedAt: expect.any(Number),
		changedAt: expect.any(Number),
		sha256: createHash("sha256").update(content).digest("hex"),
	});
	writeFileSync(file, "{invalid JSON}\n");
	expect(await pool.run(workerOnlyTask, input)).toBeNull();
});
