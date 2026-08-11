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
import { projects, terminalSessions, workspaces } from "../db/schema.ts";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	listTerminalSessions,
	replayBuffer,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-adopt-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-adopt-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let projectId: string;
let workspaceId: string;
let otherWorkspaceId: string;
let worktreePath: string;
let otherWorktreePath: string;

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	worktreePath = path.join(TEST_HOME, "worktree");
	otherWorktreePath = path.join(TEST_HOME, "other-worktree");
	fs.mkdirSync(worktreePath, { recursive: true });
	fs.mkdirSync(otherWorktreePath, { recursive: true });

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-adoption-e2e",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-adoption-e2e";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/sh");
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
	otherWorkspaceId = randomUUID();
	db.insert(workspaces)
		.values({
			id: otherWorkspaceId,
			projectId,
			worktreePath: otherWorktreePath,
			branch: "feature/other",
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

describe("createTerminalSessionInternal — host-service restart adoption", () => {
	test("fresh open uses requested initial dimensions", async () => {
		const terminalId = `e2e-dims-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			cols: 101,
			rows: 27,
		});
		assert.ok(!("error" in result));
		if ("error" in result) return;

		const daemon = await getDaemonClient();
		const daemonSession = (await daemon.list()).find(
			(s) => s.id === terminalId,
		);
		assert.ok(
			daemonSession,
			`expected terminalId "${terminalId}" in daemon.list()`,
		);
		assert.equal(daemonSession.cols, 101);
		assert.equal(daemonSession.rows, 27);

		await disposeSessionAndWait(terminalId, db);
	});

	test("existing session accepts a not-yet-queued initialCommand", async () => {
		const terminalId = `e2e-late-initcmd-${randomUUID().slice(0, 8)}`;
		const sentinelFile = path.join(TEST_HOME, `late-initcmd-${terminalId}`);

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		assert.equal(first.initialCommandQueued, false);

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: `echo ok > "${sentinelFile}"`,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;
		assert.equal(second.initialCommandQueued, true);
		await waitFor(() => fs.existsSync(sentinelFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("initialCommand runs promptly even when OSC 133;A never fires", async () => {
		// A shell name is not proof that the active launch config emits a marker.
		// Missing/stale wrappers must keep the immediate-write fallback.
		__setAccountShellForTesting("/bin/bash");
		try {
			const terminalId = `e2e-no-marker-${randomUUID().slice(0, 8)}`;
			const sentinelFile = path.join(TEST_HOME, `no-marker-${terminalId}`);

			const start = Date.now();
			const result = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				initialCommand: `echo ok > "${sentinelFile}"`,
			});
			assert.ok(!("error" in result));
			if ("error" in result) return;

			await waitFor(() => fs.existsSync(sentinelFile), 10_000);
			const elapsed = Date.now() - start;
			console.log(`[repro] initialCommand executed in ${elapsed}ms`);
			// Pre-fix: SHELL_READY_TIMEOUT_MS forced this to 15 s. 5 s leaves
			// generous headroom for CI overhead while still catching regression.
			assert.ok(
				elapsed < 5000,
				`expected initialCommand to run promptly, took ${elapsed}ms`,
			);

			await disposeSessionAndWait(terminalId, db);
		} finally {
			__setAccountShellForTesting("/bin/sh");
		}
	});

	test("initialCommand waits for a verified shell-ready marker", async () => {
		const terminalId = `e2e-delayed-marker-${randomUUID().slice(0, 8)}`;
		const sentinelFile = path.join(TEST_HOME, `delayed-marker-${terminalId}`);
		const fakeShellDir = path.join(TEST_HOME, `fake-shell-${terminalId}`);
		const fakeZsh = path.join(fakeShellDir, "zsh");
		const zshWrapperDir = path.join(TEST_HOME, "zsh");

		fs.mkdirSync(fakeShellDir, { recursive: true });
		fs.mkdirSync(zshWrapperDir, { recursive: true });
		fs.writeFileSync(
			fakeZsh,
			[
				"#!/bin/bash",
				// Simulate an interactive startup process consuming already-buffered
				// input before returning control to the shell.
				"sleep 0.5",
				"IFS= read -r -t 0.5 _discarded || true",
				"printf '\\033]133;A\\007'",
				"exec /bin/bash --noprofile --norc -i",
				"",
			].join("\n"),
			{ mode: 0o755 },
		);
		fs.writeFileSync(path.join(zshWrapperDir, ".zshrc"), "# wrapper\n");
		fs.writeFileSync(
			path.join(zshWrapperDir, ".zlogin"),
			'printf "\\033]133;A\\007"\n',
		);

		__setAccountShellForTesting(fakeZsh);
		try {
			const start = Date.now();
			const result = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				initialCommand: `echo ok > "${sentinelFile}"`,
			});
			assert.ok(!("error" in result));
			if ("error" in result) return;

			await waitFor(() => fs.existsSync(sentinelFile), 5000);
			assert.ok(
				Date.now() - start >= 450,
				"expected initialCommand to wait for delayed shell readiness",
			);
		} finally {
			await disposeSessionAndWait(terminalId, db);
			// Restore the suite-wide shell override established in before().
			__setAccountShellForTesting("/bin/sh");
			fs.rmSync(fakeShellDir, { recursive: true, force: true });
			fs.rmSync(zshWrapperDir, { recursive: true, force: true });
		}
	});

	test("cancels initialCommand when the shell exits before readiness", async () => {
		const terminalId = `e2e-exit-before-marker-${randomUUID().slice(0, 8)}`;
		const sentinelFile = path.join(
			TEST_HOME,
			`exit-before-marker-${terminalId}`,
		);
		const fakeShellDir = path.join(TEST_HOME, `fake-shell-${terminalId}`);
		const fakeZsh = path.join(fakeShellDir, "zsh");
		const zshWrapperDir = path.join(TEST_HOME, "zsh");

		fs.mkdirSync(fakeShellDir, { recursive: true });
		fs.mkdirSync(zshWrapperDir, { recursive: true });
		fs.writeFileSync(fakeZsh, "#!/bin/bash\nsleep 0.1\nexit 17\n", {
			mode: 0o755,
		});
		fs.writeFileSync(path.join(zshWrapperDir, ".zshrc"), "# wrapper\n");
		fs.writeFileSync(
			path.join(zshWrapperDir, ".zlogin"),
			'printf "\\033]133;A\\007"\n',
		);

		__setAccountShellForTesting(fakeZsh);
		try {
			const result = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				initialCommand: `echo should-not-run > "${sentinelFile}"`,
			});
			assert.ok(!("error" in result));
			if ("error" in result) return;

			await waitFor(() => result.exited, 5000);
			await result.shellReadyPromise;
			assert.equal(result.shellReadyState, "cancelled");
			assert.equal(fs.existsSync(sentinelFile), false);
		} finally {
			await disposeSessionAndWait(terminalId, db);
			__setAccountShellForTesting("/bin/sh");
			fs.rmSync(fakeShellDir, { recursive: true, force: true });
			fs.rmSync(zshWrapperDir, { recursive: true, force: true });
		}
	});

	test("rejects reusing a live terminal id from another workspace", async () => {
		const terminalId = `e2e-cross-live-${randomUUID().slice(0, 8)}`;

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId: otherWorkspaceId,
			db,
			listed: true,
		});
		assert.ok("error" in second);
		if ("error" in second) {
			assert.match(second.error, /belongs to workspace/);
		}

		assert.ok(
			listTerminalSessions({ workspaceId }).some(
				(s) => s.terminalId === terminalId,
			),
		);
		assert.equal(
			listTerminalSessions({ workspaceId: otherWorkspaceId }).some(
				(s) => s.terminalId === terminalId,
			),
			false,
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("adoptOnly refuses to spawn when daemon does not own the session", async () => {
		const terminalId = `e2e-adopt-only-${randomUUID().slice(0, 8)}`;
		db.insert(terminalSessions)
			.values({
				id: terminalId,
				originWorkspaceId: workspaceId,
				status: "active",
				createdAt: Date.now(),
			})
			.run();

		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
		});
		assert.ok("error" in result);

		const daemon = await getDaemonClient();
		const daemonSession = (await daemon.list()).find(
			(s) => s.id === terminalId,
		);
		assert.equal(daemonSession, undefined);

		db.delete(terminalSessions)
			.where(eq(terminalSessions.id, terminalId))
			.run();
	});

	test("fresh open spawns a shell via the daemon", async () => {
		const terminalId = `e2e-fresh-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		if ("error" in result) {
			assert.fail(`expected session, got error: ${result.error}`);
		}

		assert.equal(result.terminalId, terminalId);
		assert.ok(result.pty.pid > 0, "pty pid should be populated");

		const list = listTerminalSessions({ workspaceId });
		assert.ok(
			list.find((s) => s.terminalId === terminalId),
			"new session should be in listTerminalSessions",
		);

		await disposeSessionAndWait(terminalId, db);
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

		await disposeSessionAndWait(terminalId, db);
	});

	test("restoredNotice delivers the separator ahead of shell output on first replay only", async () => {
		const terminalId = `e2e-notice-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			restoredNotice: true,
		});
		assert.ok(!("error" in result));
		if ("error" in result) return;

		const first = makeCaptureSocket();
		replayBuffer(result, first.socket);
		assert.match(
			first.received(),
			/Session Contents Restored/,
			"first replay should carry the restored-session separator",
		);

		const second = makeCaptureSocket();
		replayBuffer(result, second.socket);
		assert.doesNotMatch(
			second.received(),
			/Session Contents Restored/,
			"separator should not repeat on later replays",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("restoredNotice survives FIFO eviction when the shell floods output before attach", async () => {
		const terminalId = `e2e-notice-flood-${randomUUID().slice(0, 8)}`;
		const suffix = randomUUID().slice(0, 6);
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			restoredNotice: true,
			// > MAX_BUFFER_BYTES (64 KiB) so the FIFO drops its oldest chunks
			// before any socket attaches. The marker is assembled by printf so
			// the PTY echo of the command line doesn't match it.
			initialCommand: `head -c 200000 /dev/zero | tr '\\0' x; printf 'flood-done-%s\\n' "${suffix}"`,
		});
		assert.ok(!("error" in result));
		if ("error" in result) return;

		await waitFor(
			() => sessionBufferText(result).includes(`flood-done-${suffix}`),
			15_000,
		);

		const capture = makeCaptureSocket();
		replayBuffer(result, capture.socket);
		const replayed = capture.received();
		const noticeIndex = replayed.indexOf("Session Contents Restored");
		assert.ok(noticeIndex >= 0, "separator should survive buffer eviction");
		assert.ok(
			noticeIndex < replayed.indexOf("xxxx"),
			"separator should precede the flooded shell output",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("restoredNotice is skipped when the daemon session is adopted", async () => {
		const terminalId = `e2e-notice-adopt-${randomUUID().slice(0, 8)}`;
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
			restoredNotice: true,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;

		const capture = makeCaptureSocket();
		replayBuffer(second, capture.socket);
		assert.doesNotMatch(
			capture.received(),
			/Session Contents Restored/,
			"adopted (still-live) session should not get the restored separator",
		);

		await disposeSessionAndWait(terminalId, db);
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

		await disposeSessionAndWait(terminalId, db);
	});

	test("rejects adopting a daemon session from another workspace after host-service restart simulation", async () => {
		const terminalId = `e2e-cross-adopt-${randomUUID().slice(0, 8)}`;

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
			workspaceId: otherWorkspaceId,
			db,
			listed: true,
		});
		assert.ok("error" in second);
		if ("error" in second) {
			assert.match(second.error, /belongs to workspace/);
		}

		const record = db.query.terminalSessions
			.findFirst({ where: eq(terminalSessions.id, terminalId) })
			.sync();
		assert.equal(record?.originWorkspaceId, workspaceId);
		assert.equal(
			listTerminalSessions({ workspaceId: otherWorkspaceId }).some(
				(s) => s.terminalId === terminalId,
			),
			false,
		);

		await disposeSessionAndWait(terminalId, db);
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

		await disposeSessionAndWait(terminalId, db);
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
			assert.match(second.error, /Workspace (not found|worktree)/);
		}

		// Daemon still has the orphan session — clean it up directly so the
		// test suite leaves nothing behind. Production needs a periodic
		// "orphan session sweep" but that's a separate cleanup concern.
		await disposeSessionAndWait(terminalId, db);
	});

	test("replayOnAdoption: false suppresses ring-buffer replay on reconnect", async () => {
		// Regression for the duplicated-output-on-daemon-swap bug: when the
		// renderer's xterm scrollback survives the WS reconnect (which it
		// does), replaying the daemon's ring buffer rewrites bytes the user
		// has already seen and the conversation appears doubled. This test
		// drives the createTerminalSessionInternal layer that the WS upgrade
		// handler maps to.
		const terminalId = `e2e-noreplay-${randomUUID().slice(0, 8)}`;

		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;

		// Seed the daemon's ring buffer with a sentinel — that's what would
		// be replayed on a normal adoption.
		const SENTINEL = `noreplay-sentinel-${randomUUID().slice(0, 6)}`;
		first.pty.write(`echo ${SENTINEL}\n`);
		await waitForOutput(first.pty, SENTINEL, 3000);

		// Simulate onDaemonDisconnect: host-service drops its in-memory
		// sessions; the daemon (and its ring buffer) survives.
		__resetSessionsForTesting();
		await disposeDaemonClient();

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			replayOnAdoption: false,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;
		assert.equal(
			second.pty.pid,
			first.pty.pid,
			"adopted session should have same shell pid",
		);

		// The shell may still produce live prompt bytes after reconnect, but
		// the daemon ring-buffer sentinel from the previous host lifetime must
		// not be replayed when replayOnAdoption=false.
		await new Promise((r) => setTimeout(r, 500));

		const bufferedAfterAdoption = Buffer.concat(
			second.buffer.map((b) => Buffer.from(b)),
		).toString("utf8");
		assert.equal(
			bufferedAfterAdoption.includes(SENTINEL),
			false,
			`adopted session replayed prior output despite replayOnAdoption=false: ${JSON.stringify(bufferedAfterAdoption.slice(0, 200))}`,
		);

		// Sanity check: live output still flows post-reattach.
		const LIVE_SENTINEL = `live-after-reattach-${randomUUID().slice(0, 6)}`;
		second.pty.write(`echo ${LIVE_SENTINEL}\n`);
		await waitFor(() => {
			const text = Buffer.concat(
				second.buffer.map((b) => Buffer.from(b)),
			).toString("utf8");
			return text.includes(LIVE_SENTINEL);
		}, 3000);

		await disposeSessionAndWait(terminalId, db);
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

		await disposeSessionAndWait(terminalId, db);

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
		if ("error" in second) {
			assert.fail(`re-create after dispose failed: ${second.error}`);
		}

		// Different shell pid (real fresh spawn) — not adoption.
		assert.notEqual(
			second.pty.pid,
			firstPid,
			"re-create after dispose should be a fresh spawn, not adoption of the dead session",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	// Regression: SUPER-939 / #4993 — heavy/concurrent output must never wedge
	// the shell. Output flow control is gone; back-pressure is bounded buffering
	// on the host side, never a producer pause. These guard both halves of that.

	test("heavy output with no renderer attached never wedges the PTY", async () => {
		const terminalId = `e2e-heavy-nobody-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in result));
		if ("error" in result) return;

		// ~3 MB with no socket attached — far past any old watermark. With the
		// ACK flow control removed, the daemon never pauses, so this completes;
		// the bounded replay buffer just keeps the tail (incl. the marker).
		const marker = `heavy-done-${randomUUID().slice(0, 6)}`;
		result.pty.write(
			`i=0; while [ "$i" -lt 48000 ]; do printf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\\n'; i=$((i + 1)); done; echo ${marker}\n`,
		);

		await waitFor(() => sessionBufferText(result).includes(marker), 15_000);
		await disposeSessionAndWait(terminalId, db);
	});

	test("a renderer whose send buffer exceeds the cap is dropped; output keeps flowing", async () => {
		const terminalId = `e2e-slow-renderer-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in result));
		if ("error" in result) return;

		// A renderer that's permanently behind: its WS send buffer never drains,
		// so bufferedAmount sits way over the 8 MB cap. broadcastBytes must drop
		// it instead of buffering forever.
		let closed = false;
		const stuckSocket = {
			send: () => {},
			close: () => {
				closed = true;
			},
			readyState: 1, // SOCKET_OPEN
			raw: { bufferedAmount: 64 * 1024 * 1024 },
		};
		result.sockets.add(stuckSocket);

		const marker = `slow-done-${randomUUID().slice(0, 6)}`;
		result.pty.write(
			`i=0; while [ "$i" -lt 6000 ]; do printf '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\\n'; i=$((i + 1)); done; echo ${marker}\n`,
		);

		// The stuck socket is closed and removed on the next broadcast, and the
		// PTY keeps producing — the marker lands in the (now socketless) buffer.
		await waitFor(() => closed && !result.sockets.has(stuckSocket), 10_000);
		await waitFor(() => sessionBufferText(result).includes(marker), 15_000);
		await disposeSessionAndWait(terminalId, db);
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

function sessionBufferText(session: { buffer: Uint8Array[] }): string {
	return Buffer.concat(session.buffer).toString("utf8");
}

function makeCaptureSocket() {
	const chunks: Uint8Array[] = [];
	return {
		socket: {
			send: (data: string | Uint8Array) => {
				chunks.push(
					typeof data === "string" ? Buffer.from(data, "utf8") : data,
				);
			},
			close: () => {},
			readyState: 1, // SOCKET_OPEN
		},
		received: () => Buffer.concat(chunks).toString("utf8"),
	};
}
