// End-to-end adoption test. Drives host-service's createTerminalSessionInternal
// against a real pty-daemon Server (in-process), real SQLite host DB,
// and real shells. Simulates a host-service process restart by clearing the
// in-memory sessions Map (via the test-only escape hatch) and disposing the
// DaemonClient singleton, then re-invokes createTerminalSessionInternal with
// the same terminalId and asserts the adoption path:
//   - Same shell pid as the original session.
//   - Subsequent input reaches the still-living shell.
//
// This is exactly what the daemon's process isolation enables: the daemon
// owns the PTY runtime; the host can test its integration end-to-end without
// any subprocess gymnastics.
//
// Runs under Node (`node --experimental-strip-types --test`).

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Server } from "@superset/pty-daemon";
import { eq } from "drizzle-orm";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSession,
	listTerminalSessions,
} from "./terminal.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-adopt-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-adopt-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let projectId: string;
let workspaceId: string;
let worktreePath: string;

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-adoption-e2e",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-adoption-e2e";
	process.env.NODE_ENV = "development";

	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? TEST_HOME,
		SHELL: "/bin/sh",
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	projectId = randomUUID();
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
	await disposeDaemonClient();
	await server.close();
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

describe("createTerminalSessionInternal — host-service restart adoption", () => {
	test("fresh open spawns a shell via the daemon", async () => {
		const terminalId = `e2e-fresh-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(
			!("error" in result),
			`expected session, got error: ${JSON.stringify(result)}`,
		);
		if ("error" in result) return;

		assert.equal(result.terminalId, terminalId);
		assert.ok(result.pty.pid > 0, "pty pid should be populated");

		const list = listTerminalSessions({ workspaceId });
		assert.ok(
			list.find((s) => s.terminalId === terminalId),
			"new session should be in listTerminalSessions",
		);

		disposeSession(terminalId, db);
	});

	test("adopts existing daemon session after host-service restart simulation", async () => {
		const terminalId = `e2e-adopt-${randomUUID().slice(0, 8)}`;

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		const originalPid = first.pty.pid;

		first.pty.write("echo before-host-restart\n");
		await waitForOutput(first.pty, "before-host-restart", 3000);

		// Simulate host-service crash + restart.
		__resetSessionsForTesting();
		await disposeDaemonClient();

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;

		assert.equal(
			second.pty.pid,
			originalPid,
			"adopted session should have same shell pid",
		);
		assert.equal(second.terminalId, terminalId);

		let buf = "";
		const disposer = second.pty.onData((d) => {
			buf += d;
		});
		second.pty.write("echo after-host-restart\n");
		await waitFor(() => buf.includes("after-host-restart"), 3000);
		disposer.dispose();

		disposeSession(terminalId, db);
	});

	test("adopted session keeps listed/exited bookkeeping", async () => {
		const terminalId = `e2e-bookkeeping-${randomUUID().slice(0, 8)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));

		__resetSessionsForTesting();
		await disposeDaemonClient();

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;

		assert.equal(second.exited, false);
		assert.equal(second.listed, true);
		assert.ok(
			listTerminalSessions({ workspaceId }).find(
				(s) => s.terminalId === terminalId,
			),
		);

		disposeSession(terminalId, db);
	});

	test("adopted session does NOT re-fire initialCommand", async () => {
		// Regression guard: setup.sh terminals pass an initialCommand. After
		// host-service restart, adopting the same terminalId must NOT run
		// the command a second time — that would re-execute setup.sh
		// every host-service restart, which would be catastrophic.
		const terminalId = `e2e-initcmd-${randomUUID().slice(0, 8)}`;
		const sentinelFile = path.join(TEST_HOME, `initcmd-${terminalId}.sentinel`);
		// Run on first lifetime: write a file. We then assert it isn't
		// rewritten (would have a new mtime) on the second lifetime.
		const initialCommand = `echo $$ > ${sentinelFile}`;

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: false,
			initialCommand,
		});
		assert.ok(!("error" in first));

		// Wait for sentinel file (proves initialCommand ran).
		await waitFor(() => fs.existsSync(sentinelFile), 5000);
		const firstMtime = fs.statSync(sentinelFile).mtimeMs;

		// Simulate host-service restart and adopt, passing the SAME
		// initialCommand (host-service has no way to know it already ran).
		__resetSessionsForTesting();
		await disposeDaemonClient();

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: false,
			initialCommand,
		});
		assert.ok(!("error" in second));

		// Wait long enough for the command to have run if it were going to.
		await new Promise((r) => setTimeout(r, 800));

		// Sentinel mtime unchanged → initialCommand was suppressed on adopt.
		const secondMtime = fs.statSync(sentinelFile).mtimeMs;
		assert.equal(
			secondMtime,
			firstMtime,
			"initialCommand re-fired on adopted session — would re-run setup.sh on every host-service restart",
		);

		disposeSession(terminalId, db);
	});

	test("adoption when the original workspace row is gone returns a clear error", async () => {
		// Race: host-service is down, user deletes the workspace cloud-side,
		// the workspace row is removed from the host DB. Daemon still has
		// the live session. host-service comes back, renderer reconnects
		// with the same terminalId. createTerminalSessionInternal must
		// surface a clean error (not crash, not loop).
		const ghostWorkspaceId = randomUUID();
		const ghostWorktree = path.join(TEST_HOME, "ghost-worktree");
		fs.mkdirSync(ghostWorktree, { recursive: true });
		db.insert(projects)
			.values({ id: randomUUID(), repoPath: ghostWorktree })
			.run();
		const ghostProject = randomUUID();
		db.insert(projects)
			.values({ id: ghostProject, repoPath: ghostWorktree })
			.run();
		db.insert(workspaces)
			.values({
				id: ghostWorkspaceId,
				projectId: ghostProject,
				worktreePath: ghostWorktree,
				branch: "main",
			})
			.run();

		const terminalId = `e2e-ghost-${randomUUID().slice(0, 8)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId: ghostWorkspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));

		// User deletes workspace mid-restart: row gone, worktree dir removed.
		__resetSessionsForTesting();
		await disposeDaemonClient();
		db.delete(workspaces).where(eq(workspaces.id, ghostWorkspaceId)).run();
		fs.rmSync(ghostWorktree, { recursive: true, force: true });

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId: ghostWorkspaceId,
			db,
			listed: true,
		});
		assert.ok(
			"error" in second,
			"adoption with missing workspace must return error, not throw or loop",
		);
		if ("error" in second) {
			assert.match(second.error, /Workspace worktree not found/);
		}

		// Daemon still has the orphan session — clean it up directly so the
		// test suite leaves nothing behind. Production needs a periodic
		// "orphan session sweep" but that's a separate cleanup concern.
		disposeSession(terminalId, db);
	});

	test("dispose then re-create with the same id works (no zombie state)", async () => {
		// Rapid lifecycle: user creates terminal, kills it, creates again
		// with the same id. Daemon-side cleanup must be done by the time
		// the second create runs, otherwise we'd hit "session already
		// exists" without an alive shell to adopt.
		const terminalId = `e2e-recycle-${randomUUID().slice(0, 8)}`;

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		const firstPid = "error" in first ? -1 : first.pty.pid;

		disposeSession(terminalId, db);

		// Wait for the daemon's onExit handler to mark the session exited
		// (SIGTERM → shell exits → wireSession.onExit fires → session.exited
		// flips to true → handleOpen can then recycle the id).
		await new Promise((r) => setTimeout(r, 800));

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(
			!("error" in second),
			`re-create after dispose failed: ${JSON.stringify(second)}`,
		);
		if ("error" in second) return;

		// Different shell pid (real fresh spawn) — not adoption.
		assert.notEqual(
			second.pty.pid,
			firstPid,
			"re-create after dispose should be a fresh spawn, not adoption of the dead session",
		);

		disposeSession(terminalId, db);
	});
});

// ---------------- helpers ----------------

async function waitFor(predicate: () => boolean, ms: number): Promise<void> {
	const start = Date.now();
	while (!predicate()) {
		if (Date.now() - start > ms) throw new Error("waitFor timed out");
		await new Promise((r) => setTimeout(r, 25));
	}
}

async function waitForOutput(
	pty: { onData: (cb: (d: string) => void) => { dispose(): void } },
	marker: string,
	ms: number,
): Promise<void> {
	let buf = "";
	const disposer = pty.onData((d) => {
		buf += d;
	});
	try {
		await waitFor(() => buf.includes(marker), ms);
	} finally {
		disposer.dispose();
	}
}
