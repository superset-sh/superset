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
import type { SubscribeCallbacks } from "./DaemonClient/index.ts";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	acknowledgeReplayDelivery,
	cancelReplayDelivery,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	listTerminalSessions,
	prepareReplayDelivery,
	replayBuffer,
	respawnAfterFailedAdoption,
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
	process.env.ORGANIZATION_ID = `adoption-e2e-${process.pid}`;
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
		assert.equal(
			result.nextAttachReplayKind,
			"none",
			"a newly spawned shell must preserve renderer-restored history",
		);

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
			initialCommand: `echo ok > ${sentinelFile}`,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;
		assert.equal(second.initialCommandQueued, true);
		await waitFor(() => fs.existsSync(sentinelFile), 5000);

		await disposeSessionAndWait(terminalId, db);
	});

	test("initialCommand runs promptly even when OSC 133;A never fires", async () => {
		// Regression guard against reintroducing the SHELL_READY_TIMEOUT_MS
		// stall: bash with no Superset wrapper on disk never emits OSC 133;A,
		// but the preset command should still run as soon as the shell reads.
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
				initialCommand: `echo ok > ${sentinelFile}`,
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
		assert.equal(
			second.nextAttachReplayKind,
			"full",
			"an adopted daemon session must announce its full ring replay",
		);
		await waitFor(
			() => sessionBufferText(second).includes("before-host-restart"),
			3000,
		);
		const interruptedReplay = makeCaptureSocket();
		const interruptedDelivery = prepareReplayDelivery(
			second,
			interruptedReplay.socket,
		);
		replayBuffer(second, interruptedReplay.socket, interruptedDelivery);
		assert.match(interruptedReplay.received(), /before-host-restart/);
		assert.equal(
			second.nextAttachReplayKind,
			"full",
			"sending without an applied ACK must retain the full replay",
		);
		assert.equal(
			acknowledgeReplayDelivery(
				second,
				interruptedReplay.socket,
				(interruptedDelivery.replayId ?? 0) + 1,
			),
			false,
			"a wrong replayId must not retire the snapshot",
		);
		cancelReplayDelivery(second, interruptedReplay.socket);
		assert.equal(
			acknowledgeReplayDelivery(
				second,
				interruptedReplay.socket,
				interruptedDelivery.replayId ?? 0,
			),
			false,
			"an ACK from a closed socket must be stale",
		);

		const appliedReplay = makeCaptureSocket();
		const appliedDelivery = prepareReplayDelivery(second, appliedReplay.socket);
		replayBuffer(second, appliedReplay.socket, appliedDelivery);
		assert.match(appliedReplay.received(), /before-host-restart/);
		assert.equal(
			acknowledgeReplayDelivery(
				second,
				appliedReplay.socket,
				appliedDelivery.replayId ?? 0,
			),
			true,
			"the matching socket/replayId ACK retires the full snapshot",
		);
		assert.equal(second.nextAttachReplayKind, "delta");
		assert.equal(second.fullReplayBuffer, null);
		assert.equal(
			acknowledgeReplayDelivery(
				second,
				appliedReplay.socket,
				appliedDelivery.replayId ?? 0,
			),
			false,
			"a repeated ACK is stale",
		);

		let buf = "";
		const disposer = second.pty.onData((d) => {
			buf += d;
		});
		second.pty.write("echo after-host-restart\n");
		await waitFor(() => buf.includes("after-host-restart"), 3000);
		disposer.dispose();

		await disposeSessionAndWait(terminalId, db);
	});

	test("legacy replay=0 adoption suppresses the daemon ring", async () => {
		const terminalId = `e2e-legacy-replay-zero-${randomUUID().slice(0, 8)}`;
		const marker = `legacy-baseline-${randomUUID().slice(0, 6)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		const originalPid = first.pty.pid;
		first.pty.write(`printf '${marker}\\n'\n`);
		await waitForOutput(first.pty, marker, 3000);

		__resetSessionsForTesting();
		await disposeDaemonClient();

		const adopted = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
			replayOnAdoption: false,
		});
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;
		assert.equal(adopted.pty.pid, originalPid);
		assert.equal(adopted.nextAttachReplayKind, "delta");
		assert.equal(adopted.fullReplayBuffer, null);
		assert.doesNotMatch(
			sessionBufferText(adopted),
			new RegExp(marker),
			"legacy replay=0 must not redeliver the already-rendered ring",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("all sockets ACK the current full generation before it is released", async () => {
		const terminalId = `e2e-replay-ack-multi-${randomUUID().slice(0, 8)}`;
		const marker = `multi-replay-${randomUUID().slice(0, 6)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		first.pty.write(`echo ${marker}\n`);
		await waitForOutput(first.pty, marker, 3000);

		__resetSessionsForTesting();
		await disposeDaemonClient();
		const adopted = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
		});
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;

		const socketA = makeCaptureSocket();
		const deliveryA = prepareReplayDelivery(adopted, socketA.socket);
		replayBuffer(adopted, socketA.socket, deliveryA);
		const socketB = makeCaptureSocket();
		const deliveryB = prepareReplayDelivery(adopted, socketB.socket);
		replayBuffer(adopted, socketB.socket, deliveryB);
		adopted.sockets.add(socketA.socket);
		adopted.sockets.add(socketB.socket);
		assert.ok(deliveryA.replayId !== undefined);
		assert.ok(deliveryB.replayId !== undefined);

		assert.equal(
			acknowledgeReplayDelivery(adopted, socketA.socket, deliveryA.replayId),
			true,
		);
		assert.ok(
			adopted.fullReplayBuffer?.byteLength,
			"socket B still owns an outstanding full delivery",
		);
		assert.equal(adopted.pendingReplayAcks.size, 1);

		cancelReplayDelivery(adopted, socketB.socket);
		adopted.sockets.delete(socketB.socket);
		assert.equal(adopted.nextAttachReplayKind, "full");
		assert.equal(adopted.pendingReplayAcks.size, 0);

		const liveMarker = `post-replay-${randomUUID().slice(0, 6)}`;
		adopted.pty.write(`printf '${liveMarker}\\n'\n`);
		await waitFor(() => socketA.received().includes(liveMarker), 3000);
		assert.match(
			sessionBufferText(adopted),
			new RegExp(liveMarker),
			"live tail remains recoverable between close and reconnect",
		);

		const reconnectedB = makeCaptureSocket();
		const reconnectedDelivery = prepareReplayDelivery(
			adopted,
			reconnectedB.socket,
		);
		replayBuffer(adopted, reconnectedB.socket, reconnectedDelivery);
		assert.match(reconnectedB.received(), new RegExp(marker));
		assert.match(reconnectedB.received(), new RegExp(liveMarker));
		assert.ok(reconnectedDelivery.replayId !== undefined);
		assert.equal(
			acknowledgeReplayDelivery(
				adopted,
				reconnectedB.socket,
				reconnectedDelivery.replayId,
			),
			true,
		);
		assert.equal(adopted.fullReplayBuffer, null);
		assert.equal(adopted.pendingReplayAcks.size, 0);
		assert.equal(adopted.nextAttachReplayKind, "delta");

		await disposeSessionAndWait(terminalId, db);
	});

	test("full recovery stays bounded across oversized daemon and post-boundary tails", async () => {
		const terminalId = `e2e-replay-bounded-${randomUUID().slice(0, 8)}`;
		const result = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in result));
		if ("error" in result) return;

		const daemonReplay = new Uint8Array(80 * 1024).fill("d".charCodeAt(0));
		const liveTail = new Uint8Array(80 * 1024).fill("l".charCodeAt(0));
		const newestMarker = Buffer.from("newest-live-tail");
		liveTail.set(newestMarker, liveTail.byteLength - newestMarker.byteLength);
		result.fullReplayBuffer = daemonReplay;
		result.fullReplayGeneration = 1;
		result.nextAttachReplayKind = "full";
		result.buffer.push(liveTail);
		result.bufferBytes = liveTail.byteLength;

		const first = makeCaptureSocket();
		const firstDelivery = prepareReplayDelivery(result, first.socket);
		assert.equal(result.fullReplayBuffer?.byteLength, 64 * 1024);
		assert.equal(result.bufferBytes, 0);
		assert.equal(firstDelivery.replayDataBytes, 64 * 1024);
		assert.equal(firstDelivery.replayTruncated, true);
		assert.ok(
			Buffer.from(firstDelivery.payload ?? []).includes(newestMarker),
			"the newest live bytes must survive bounded tail eviction",
		);
		replayBuffer(result, first.socket, firstDelivery);
		cancelReplayDelivery(result, first.socket);

		const secondTail = new Uint8Array(80 * 1024).fill("n".charCodeAt(0));
		const secondMarker = Buffer.from("newest-after-reconnect");
		secondTail.set(
			secondMarker,
			secondTail.byteLength - secondMarker.byteLength,
		);
		result.buffer.push(secondTail);
		result.bufferBytes = secondTail.byteLength;
		const second = makeCaptureSocket();
		const secondDelivery = prepareReplayDelivery(result, second.socket);
		assert.equal(result.fullReplayBuffer?.byteLength, 64 * 1024);
		assert.equal(secondDelivery.replayDataBytes, 64 * 1024);
		assert.equal(secondDelivery.replayTruncated, true);
		assert.ok(
			Buffer.from(secondDelivery.payload ?? []).includes(secondMarker),
			"repeated failed deliveries must retain the newest bounded tail",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("full replay ACK releases only its snapshot and retains later live bytes as delta", async () => {
		const terminalId = `e2e-replay-post-ack-tail-${randomUUID().slice(0, 8)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: "printf replay-boundary-ready",
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		await waitFor(
			() => sessionBufferText(first).includes("replay-boundary-ready"),
			3000,
		);
		__resetSessionsForTesting();
		await disposeDaemonClient();
		const adopted = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
		});
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;

		const socket = makeCaptureSocket();
		const delivery = prepareReplayDelivery(adopted, socket.socket);
		replayBuffer(adopted, socket.socket, delivery);
		const postBoundary = Buffer.from("post-boundary-live-tail");
		adopted.buffer.push(postBoundary);
		adopted.bufferBytes += postBoundary.byteLength;
		assert.ok(delivery.replayId !== undefined);
		assert.equal(
			acknowledgeReplayDelivery(adopted, socket.socket, delivery.replayId),
			true,
		);
		assert.equal(adopted.fullReplayBuffer, null);
		assert.equal(adopted.nextAttachReplayKind, "delta");
		assert.equal(adopted.bufferBytes, postBoundary.byteLength);

		const reconnect = makeCaptureSocket();
		const delta = prepareReplayDelivery(adopted, reconnect.socket);
		assert.equal(delta.replayKind, "delta");
		assert.equal(delta.replayDataBytes, postBoundary.byteLength);
		replayBuffer(adopted, reconnect.socket, delta);
		assert.match(reconnect.received(), /post-boundary-live-tail/);
		assert.equal(adopted.bufferBytes, 0);

		await disposeSessionAndWait(terminalId, db);
	});

	test("out-of-order generation ACKs release only after every delivery is durable", async () => {
		const terminalId = `e2e-replay-ack-stale-${randomUUID().slice(0, 8)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: "printf stale-replay-ready",
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		await waitFor(
			() => sessionBufferText(first).includes("stale-replay-ready"),
			3000,
		);
		__resetSessionsForTesting();
		await disposeDaemonClient();

		const adopted = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
		});
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;
		const oldSocket = makeCaptureSocket();
		const oldDelivery = prepareReplayDelivery(adopted, oldSocket.socket);
		replayBuffer(adopted, oldSocket.socket, oldDelivery);
		const laterBytes = new TextEncoder().encode("newer-replay-generation");
		adopted.buffer.push(laterBytes);
		adopted.bufferBytes += laterBytes.byteLength;

		const currentSocket = makeCaptureSocket();
		const currentDelivery = prepareReplayDelivery(
			adopted,
			currentSocket.socket,
		);
		replayBuffer(adopted, currentSocket.socket, currentDelivery);
		assert.ok(currentDelivery.replayId !== undefined);
		assert.equal(
			acknowledgeReplayDelivery(
				adopted,
				currentSocket.socket,
				currentDelivery.replayId,
			),
			true,
		);
		assert.ok(adopted.fullReplayBuffer?.byteLength);
		assert.equal(adopted.nextAttachReplayKind, "full");
		assert.ok(oldDelivery.replayId !== undefined);
		assert.equal(
			acknowledgeReplayDelivery(
				adopted,
				oldSocket.socket,
				oldDelivery.replayId,
			),
			true,
		);
		assert.equal(adopted.fullReplayBuffer, null);
		assert.equal(adopted.pendingReplayAcks.size, 0);
		assert.equal(adopted.nextAttachReplayKind, "delta");

		await disposeSessionAndWait(terminalId, db);
	});

	test("synchronous replay send failure retains the full snapshot", async () => {
		const terminalId = `e2e-replay-send-throw-${randomUUID().slice(0, 8)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			initialCommand: "printf send-throw-ready",
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		await waitFor(
			() => sessionBufferText(first).includes("send-throw-ready"),
			3000,
		);
		__resetSessionsForTesting();
		await disposeDaemonClient();

		const adopted = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
		});
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;
		const throwingSocket = {
			send: () => {
				throw new Error("synthetic send failure");
			},
			close: () => {},
			readyState: 1,
		};
		const delivery = prepareReplayDelivery(adopted, throwingSocket);
		assert.throws(
			() => replayBuffer(adopted, throwingSocket, delivery),
			/synthetic send failure/,
		);
		assert.ok(adopted.fullReplayBuffer?.byteLength);
		assert.equal(adopted.nextAttachReplayKind, "full");
		assert.equal(adopted.pendingReplayAcks.size, 0);

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

	test("empty adopted ring stays delta when live output arrives later", async () => {
		const terminalId = `e2e-empty-adopt-${randomUUID().slice(0, 8)}`;
		const daemon = await getDaemonClient();
		const opened = await daemon.open(terminalId, {
			shell: "/bin/cat",
			argv: [],
			cwd: worktreePath,
			cols: 80,
			rows: 24,
		});

		const adopted = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			adoptOnly: true,
		});
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;
		assert.equal(adopted.pty.pid, opened.pid);
		assert.equal(adopted.nextAttachReplayKind, "delta");
		assert.equal(adopted.fullReplayBuffer, null);

		const marker = `later-live-${randomUUID().slice(0, 6)}`;
		adopted.pty.write(`${marker}\n`);
		await waitFor(() => sessionBufferText(adopted).includes(marker), 3000);
		assert.equal(
			adopted.nextAttachReplayKind,
			"delta",
			"a byte produced after an empty replay boundary must append, not reset",
		);

		await disposeSessionAndWait(terminalId, db);
	});

	test("legacy daemon without replay ACK classifies ordered buffered bytes as full", async () => {
		const terminalId = `e2e-legacy-adopt-${randomUUID().slice(0, 8)}`;
		const marker = `legacy-replay-${randomUUID().slice(0, 6)}`;
		const daemon = await getDaemonClient();
		await daemon.open(terminalId, {
			shell: "/bin/sh",
			argv: ["-c", `printf '${marker}'; sleep 10`],
			cwd: worktreePath,
			cols: 80,
			rows: 24,
		});
		await new Promise((resolve) => setTimeout(resolve, 100));

		const subscribeWithBoundary =
			daemon.subscribeWithReplayBoundary.bind(daemon);
		daemon.subscribeWithReplayBoundary = (id, opts, callbacks) => {
			const unsubscribe = daemon.subscribe(id, opts, callbacks);
			return {
				unsubscribe,
				boundary: daemon.list().then(() => ({ replayBytes: null })),
			};
		};

		let adopted: Awaited<ReturnType<typeof createTerminalSessionInternal>>;
		try {
			adopted = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				adoptOnly: true,
			});
		} finally {
			daemon.subscribeWithReplayBoundary = subscribeWithBoundary;
		}
		assert.ok(!("error" in adopted));
		if ("error" in adopted) return;
		assert.equal(adopted.nextAttachReplayKind, "full");
		const capture = makeCaptureSocket();
		replayBuffer(adopted, capture.socket);
		assert.match(capture.received(), new RegExp(marker));

		await disposeSessionAndWait(terminalId, db);
	});

	test("exit during a legacy adoption barrier is re-read and never respawned", async () => {
		const terminalId = `e2e-legacy-exit-race-${randomUUID().slice(0, 8)}`;
		db.insert(terminalSessions)
			.values({
				id: terminalId,
				originWorkspaceId: workspaceId,
				status: "active",
				createdAt: Date.now(),
			})
			.run();

		// Deterministically model onExit winning while the legacy list barrier
		// awaited its ordered reply.
		db.update(terminalSessions)
			.set({ status: "exited", endedAt: Date.now() })
			.where(eq(terminalSessions.id, terminalId))
			.run();
		let respawnCalls = 0;
		const result = await respawnAfterFailedAdoption(
			{
				terminalId,
				requestedWorkspaceId: workspaceId,
				themeType: "dark",
				db,
			},
			async () => {
				respawnCalls += 1;
				return { error: "unexpected respawn" };
			},
		);
		assert.deepEqual(result, {
			error: `Terminal session "${terminalId}" has exited.`,
		});
		assert.equal(respawnCalls, 0);
	});

	test("late aggregate exit after cleanup cannot retire the durable generation", async () => {
		const terminalId = `e2e-late-exit-after-cleanup-${randomUUID().slice(0, 8)}`;
		const daemon = await getDaemonClient();
		const originalSubscribe = daemon.subscribe.bind(daemon);
		let lateExit: SubscribeCallbacks["onExit"] | undefined;
		daemon.subscribe = (id, options, callbacks) => {
			if (id === terminalId && !lateExit) lateExit = callbacks.onExit;
			return originalSubscribe(id, options, callbacks);
		};

		let opened: Awaited<ReturnType<typeof createTerminalSessionInternal>>;
		try {
			opened = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
			});
		} finally {
			daemon.subscribe = originalSubscribe;
		}
		assert.ok(!("error" in opened));
		assert.ok(lateExit, "expected to capture the lifecycle exit callback");
		if ("error" in opened || !lateExit) return;

		// Failed-adoption cleanup removes the half-created in-memory session
		// before an already queued daemon exit callback can run.
		__resetSessionsForTesting();
		lateExit({ code: 1, signal: 0 });

		const rowAfterLateExit = db.query.terminalSessions
			.findFirst({ where: eq(terminalSessions.id, terminalId) })
			.sync();
		let respawnCalls = 0;
		const respawnResult = await respawnAfterFailedAdoption(
			{
				terminalId,
				requestedWorkspaceId: workspaceId,
				themeType: "dark",
				db,
			},
			async () => {
				respawnCalls += 1;
				return { error: "synthetic recovery" };
			},
		);

		await disposeSessionAndWait(terminalId, db);

		assert.equal(rowAfterLateExit?.status, "active");
		assert.deepEqual(respawnResult, {
			error: "synthetic recovery",
		});
		assert.equal(respawnCalls, 1);
	});

	test("lifecycle transition after the respawn re-read blocks a fresh shell", async () => {
		const terminalId = `e2e-respawn-cas-before-open-${randomUUID().slice(0, 8)}`;
		db.insert(terminalSessions)
			.values({
				id: terminalId,
				originWorkspaceId: workspaceId,
				status: "active",
				createdAt: Date.now(),
			})
			.run();

		let respawnCalls = 0;
		const result = await respawnAfterFailedAdoption(
			{
				terminalId,
				requestedWorkspaceId: workspaceId,
				themeType: "dark",
				db,
			},
			async (options) => {
				respawnCalls += 1;
				// This callback starts strictly after respawnAfterFailedAdoption's
				// durable re-read. A concurrent dispose must win over recovery.
				db.update(terminalSessions)
					.set({ status: "disposed", endedAt: Date.now() })
					.where(eq(terminalSessions.id, terminalId))
					.run();
				return createTerminalSessionInternal(options);
			},
		);

		assert.equal(respawnCalls, 1);
		assert.deepEqual(result, {
			error: `Terminal session "${terminalId}" is disposed.`,
		});
		const daemon = await getDaemonClient();
		assert.equal(
			(await daemon.list()).some(
				(entry) => entry.id === terminalId && entry.alive,
			),
			false,
			"a lost CAS before open must not spawn a shell",
		);
	});

	test("lifecycle transition during async respawn closes the unclaimed shell", async () => {
		const terminalId = `e2e-respawn-cas-during-open-${randomUUID().slice(0, 8)}`;
		db.insert(terminalSessions)
			.values({
				id: terminalId,
				originWorkspaceId: workspaceId,
				status: "active",
				createdAt: Date.now(),
			})
			.run();

		const daemon = await getDaemonClient();
		const originalOpen = daemon.open.bind(daemon);
		daemon.open = async (id, meta) => {
			const opened = await originalOpen(id, meta);
			// Deterministically inject the competing lifecycle write after the
			// daemon has spawned the PTY but before host-service commits ownership.
			db.update(terminalSessions)
				.set({ status: "disposed", endedAt: Date.now() })
				.where(eq(terminalSessions.id, terminalId))
				.run();
			return opened;
		};

		let result: Awaited<ReturnType<typeof respawnAfterFailedAdoption>>;
		try {
			result = await respawnAfterFailedAdoption({
				terminalId,
				requestedWorkspaceId: workspaceId,
				themeType: "dark",
				db,
			});
		} finally {
			daemon.open = originalOpen;
		}

		assert.deepEqual(result, {
			error: `Terminal session "${terminalId}" is disposed.`,
		});
		await waitForDaemonSessionStopped(daemon, terminalId, 3000);
	});

	test("late exit from an old lifecycle cannot poison a recreated terminal", async () => {
		const terminalId = `e2e-stale-exit-generation-${randomUUID().slice(0, 8)}`;
		const daemon = await getDaemonClient();
		const originalSubscribe = daemon.subscribe.bind(daemon);
		let staleExit: SubscribeCallbacks["onExit"] | undefined;
		daemon.subscribe = (id, options, callbacks) => {
			if (id === terminalId && !staleExit) staleExit = callbacks.onExit;
			return originalSubscribe(id, options, callbacks);
		};

		let first: Awaited<ReturnType<typeof createTerminalSessionInternal>>;
		try {
			first = await createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
			});
		} finally {
			daemon.subscribe = originalSubscribe;
		}
		assert.ok(!("error" in first));
		assert.ok(
			staleExit,
			"expected to capture the first lifecycle exit callback",
		);
		if ("error" in first || !staleExit) return;
		const firstCreatedAt = first.createdAt;

		await disposeSessionAndWait(terminalId, db);
		await new Promise((resolve) => setTimeout(resolve, 800));

		const second = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in second));
		if ("error" in second) return;
		assert.notEqual(second.createdAt, firstCreatedAt);

		staleExit({ code: 99, signal: 0 });
		const rowAfterStaleExit = db.query.terminalSessions
			.findFirst({ where: eq(terminalSessions.id, terminalId) })
			.sync();
		const secondStillAlive = (await daemon.list()).some(
			(entry) => entry.id === terminalId && entry.alive,
		);

		await disposeSessionAndWait(terminalId, db);

		assert.equal(rowAfterStaleExit?.status, "active");
		assert.equal(rowAfterStaleExit?.createdAt, second.createdAt);
		assert.equal(second.exited, false);
		assert.equal(secondStillAlive, true);
	});

	test("concurrent adopters share one replay boundary", async () => {
		const terminalId = `e2e-concurrent-adopt-${randomUUID().slice(0, 8)}`;
		const first = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
		});
		assert.ok(!("error" in first));
		if ("error" in first) return;
		first.pty.write("echo concurrent-replay\n");
		await waitForOutput(first.pty, "concurrent-replay", 3000);

		__resetSessionsForTesting();
		await disposeDaemonClient();
		const [a, b] = await Promise.all([
			createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				adoptOnly: true,
			}),
			createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
				listed: true,
				adoptOnly: true,
			}),
		]);
		assert.ok(!("error" in a));
		assert.ok(!("error" in b));
		if ("error" in a || "error" in b) return;
		assert.equal(a, b);
		assert.equal(a.nextAttachReplayKind, "full");

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

async function waitForDaemonSessionStopped(
	daemon: Awaited<ReturnType<typeof getDaemonClient>>,
	terminalId: string,
	ms: number,
): Promise<void> {
	const start = Date.now();
	while (true) {
		const alive = (await daemon.list()).some(
			(entry) => entry.id === terminalId && entry.alive,
		);
		if (!alive) return;
		if (Date.now() - start > ms) {
			throw new Error(
				`terminal ${terminalId} stayed alive after its lifecycle CAS was lost`,
			);
		}
		await new Promise((resolve) => setTimeout(resolve, 25));
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

function sessionBufferText(session: {
	buffer: Uint8Array[];
	fullReplayBuffer?: Uint8Array | null;
}): string {
	return Buffer.concat([
		session.fullReplayBuffer ?? Buffer.alloc(0),
		...session.buffer,
	]).toString("utf8");
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
