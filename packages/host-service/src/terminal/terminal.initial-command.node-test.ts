// End-to-end tests for initialCommand delivery: long commands must survive
// the canonical-mode PTY input path. The kernel line discipline caps a
// canonical-mode input line at MAX_CANON (1024 bytes on macOS) and silently
// drops the rest — typing a >1KB agent launch command lost its closing quote
// and wedged the shell at `quote>` (#5092). Long commands are now staged as a
// self-deleting temp script and delivered via a short source line.
//
// Same harness as terminal.send-snapshot.node-test.ts: real pty-daemon Server
// (in-process), real SQLite host DB, real /bin/sh.
//
//   node --experimental-strip-types --test <file>
// (or Electron-as-Node / tsx loader — see terminal.send-snapshot.node-test.ts)

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	snapshotSession,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-initcmd-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-initcmd-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let workspaceId: string;

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-initcmd-e2e",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-initcmd-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/sh");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? TEST_HOME,
		SHELL: "/bin/sh",
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	const projectId = randomUUID();
	workspaceId = randomUUID();
	db.insert(projects).values({ id: projectId, repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({
			id: workspaceId,
			projectId,
			worktreePath,
			branch: "main",
		})
		.run();
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	await server.close();
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

describe("initialCommand delivery", () => {
	test("a >2KB initialCommand executes fully (no MAX_CANON truncation)", async () => {
		const terminalId = `e2e-longcmd-${randomUUID().slice(0, 8)}`;
		const outFile = path.join(TEST_HOME, `long-${terminalId}`);
		// Well past the 1024-byte canonical-mode line cap. The head/tail
		// sentinels prove neither end of the payload was clipped.
		const payload = `head-${"x".repeat(2400)}-tail`;
		const command = `printf '%s' '${payload}' > "${outFile}"`;
		assert.ok(Buffer.byteLength(command, "utf8") > 2048);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: command,
		});
		assert.ok(!("error" in session), JSON.stringify(session));
		if ("error" in session) return;

		// The command round-trips byte-for-byte, so nothing was truncated and
		// the shell is not stuck at a continuation prompt.
		await waitFor(
			() =>
				fs.existsSync(outFile) && fs.readFileSync(outFile, "utf8") === payload,
			10_000,
		);

		// The staged launch script removed itself when it ran.
		const leftovers = fs
			.readdirSync(os.tmpdir())
			.filter((f) => f.startsWith(`superset-launch-${terminalId}`));
		assert.deepEqual(leftovers, []);

		await disposeSessionAndWait(terminalId, db);
	});

	test("staging failure falls back to typing the full command", async () => {
		const terminalId = `e2e-fallback-${randomUUID().slice(0, 8)}`;
		const outFile = path.join(TEST_HOME, `fallback-${terminalId}`);
		// Over the 512-byte staging threshold but under MAX_CANON, so the
		// typed-directly fallback still delivers it intact.
		const payload = `fb-${"y".repeat(540)}-fb`;
		const command = `printf '%s' '${payload}' > "${outFile}"`;
		assert.ok(Buffer.byteLength(command, "utf8") > 512);
		assert.ok(Buffer.byteLength(command, "utf8") < 1000);

		// Point tmpdir at a nonexistent directory so writeFileSync throws.
		const origTmpdir = process.env.TMPDIR;
		process.env.TMPDIR = path.join(TEST_HOME, "no-such-dir", "nested");
		try {
			const session = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				initialCommand: command,
			});
			assert.ok(!("error" in session), JSON.stringify(session));
			if ("error" in session) return;

			await waitFor(
				() =>
					fs.existsSync(outFile) &&
					fs.readFileSync(outFile, "utf8") === payload,
				10_000,
			);
		} finally {
			if (origTmpdir === undefined) {
				delete process.env.TMPDIR;
			} else {
				process.env.TMPDIR = origTmpdir;
			}
			await disposeSessionAndWait(terminalId, db);
		}
	});

	test("pre-Enter teardown unlinks the staged script", async () => {
		const terminalId = `e2e-cleanup-${randomUUID().slice(0, 8)}`;
		const sentinel = path.join(TEST_HOME, `cleanup-ran-${terminalId}`);
		// Padded past the staging threshold; the sentinel write distinguishes
		// "guard unlinked the script" from "script ran and self-deleted".
		const command = `echo ran > "${sentinel}" # ${"z".repeat(600)}`;

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: command,
		});
		assert.ok(!("error" in session), JSON.stringify(session));
		if ("error" in session) return;

		const staged = () =>
			fs
				.readdirSync(os.tmpdir())
				.filter((f) => f.startsWith(`superset-launch-${terminalId}`));

		// The script exists in the write→delayed-Enter window…
		await waitFor(() => staged().length === 1, 5_000);

		// …and disposing the session before the Enter fires removes it.
		await disposeSessionAndWait(terminalId, db);
		await waitFor(() => staged().length === 0, 5_000);

		// Past the Enter delay, the command must never have executed — the
		// script vanished via the teardown unlink, not via self-delete-and-run.
		await new Promise((r) => setTimeout(r, 700));
		assert.equal(fs.existsSync(sentinel), false);
	});

	test("short commands are still typed verbatim into the PTY", async () => {
		const terminalId = `e2e-shortcmd-${randomUUID().slice(0, 8)}`;
		const id = randomUUID().slice(0, 6);
		const outFile = path.join(TEST_HOME, `short-${terminalId}`);

		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `echo run-${id} > "${outFile}"`,
		});
		assert.ok(!("error" in session));
		if ("error" in session) return;

		await waitFor(() => fs.existsSync(outFile), 10_000);

		// The PTY echoed the typed command itself — not a staged source line.
		const snap = await snapshotSession({ terminalId, workspaceId, db });
		assert.ok(!("error" in snap), JSON.stringify(snap));
		if ("error" in snap) return;
		assert.ok(
			snap.text.includes(`echo run-${id}`),
			`expected typed command echo, got: ${JSON.stringify(snap.text)}`,
		);
		assert.ok(!snap.text.includes("superset-launch-"));

		await disposeSessionAndWait(terminalId, db);
	});
});

async function waitFor(predicate: () => boolean, ms: number): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > ms) throw new Error("waitFor timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}
