// Daemon-stall attach classification: when the pty-daemon is unreachable, an
// attach (create-on-attach or existing-session) must fail with
// `code: "attach-retryable"` — NOT session-gone, NOT a plain fatal error — so
// the renderer keeps its reconnect loop alive, and a later retry of the SAME
// terminalId must produce exactly one working session once the daemon is back.
//
// Harness mirrors terminal.create-on-attach.node-test.ts, except the daemon
// Server is only started mid-suite to simulate recovery.
//
// Run:
//   cd packages/host-service && node --experimental-strip-types --test \
//     src/terminal/terminal.daemon-stall-retry.node-test.ts

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Server } from "@superset/pty-daemon";
import {
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
} from "@superset/pty-daemon/protocol";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, terminalSessions, workspaces } from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	isLiveTerminalSession,
	listTerminalSessions,
	registerWorkspaceTerminalRoute,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-stallretry-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-stallretry-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server | null = null;
let db: HostDb;
let workspaceId: string;
let httpPort: number;
let httpServer: ReturnType<typeof serve>;

type FirstResult =
	| { kind: "attached" }
	| { kind: "error"; message: string; code?: string };

function dial(
	terminalId: string,
	query: string,
	timeoutMs = 15_000,
): Promise<FirstResult> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(
			`ws://127.0.0.1:${httpPort}/terminal/${terminalId}${query}`,
		);
		ws.binaryType = "arraybuffer";
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error("attach timeout"));
		}, timeoutMs);
		const done = (result: FirstResult) => {
			clearTimeout(timer);
			ws.close();
			resolve(result);
		};
		ws.addEventListener("message", (event) => {
			const data = (event as MessageEvent).data;
			if (data instanceof ArrayBuffer) return;
			const message = JSON.parse(String(data)) as {
				type: string;
				message?: string;
				code?: string;
			};
			if (message.type === "attached") done({ kind: "attached" });
			if (message.type === "error")
				done({
					kind: "error",
					message: message.message ?? "",
					code: message.code,
				});
		});
		ws.addEventListener("error", () => {
			clearTimeout(timer);
			reject(new Error("ws error during connect"));
		});
	});
}

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });

	// No daemon Server yet: SOCK has no listener, so every daemon connect is
	// refused — the "daemon down/stalled" half of the suite.
	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-stallretry-test";
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
		.values({ id: workspaceId, projectId, worktreePath, branch: "main" })
		.run();

	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
	registerWorkspaceTerminalRoute({
		app,
		db,
		eventBus: undefined as unknown as EventBus,
		upgradeWebSocket,
	});
	httpPort = await new Promise<number>((resolve) => {
		httpServer = serve(
			{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
			(info) => resolve(info.port),
		);
	});
	injectWebSocket(httpServer);
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	if (server) await server.close();
	await new Promise<void>((resolve) => httpServer.close(() => resolve()));
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

// Ids shared across the down/recovered phases — the whole point is that the
// SAME id retried after recovery yields exactly one session.
const createId = `stall-create-${randomUUID().slice(0, 8)}`;
const existingId = `stall-existing-${randomUUID().slice(0, 8)}`;

test("create-on-attach with daemon down fails attach-retryable, leaves no row", async () => {
	const result = await dial(createId, `?workspaceId=${workspaceId}&create=1`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, "attach-retryable");
	}
	assert.ok(!isLiveTerminalSession(createId));
	const row = db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, createId) })
		.sync();
	assert.equal(row, undefined);
});

test("existing active session with daemon down fails attach-retryable, not session-gone", async () => {
	db.insert(terminalSessions)
		.values({
			id: existingId,
			originWorkspaceId: workspaceId,
			status: "active",
		})
		.run();
	const result = await dial(existingId, `?workspaceId=${workspaceId}`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, "attach-retryable");
	}
	// The row must stay active: a stalled daemon is not proof the PTY died.
	const row = db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, existingId) })
		.sync();
	assert.equal(row?.status, "active");
});

// The headline outage: the daemon socket ACCEPTS and handshakes but never
// answers `open` (SIGSTOP-style wedge) — distinct from the refused-connect
// tests above. The attach must fail through the daemon-open timeout and
// still classify attach-retryable.
test("unresponsive daemon (accepts, never replies to open) times out attach-retryable", async () => {
	const stallSock = path.join(
		os.tmpdir(),
		`host-svc-stallretry-wedge-${process.pid}.sock`,
	);
	const stallServer = net.createServer((socket) => {
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				if ((frame.message as { type: string }).type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion: "0.0.0-wedged",
						}),
					);
				}
				// open/list/close: swallow silently, like a SIGSTOPped daemon
				// whose socket buffer still accepts writes.
			}
		});
	});
	await new Promise<void>((resolve) => stallServer.listen(stallSock, resolve));
	await disposeDaemonClient();
	process.env.SUPERSET_PTY_DAEMON_SOCKET = stallSock;

	const tid = `stall-wedge-${randomUUID().slice(0, 8)}`;
	// The daemon-open timeout is 15s; give the dial margin past it.
	const result = await dial(
		tid,
		`?workspaceId=${workspaceId}&create=1`,
		25_000,
	);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, "attach-retryable");
		assert.match(result.message, /timed out/);
	}
	assert.ok(!isLiveTerminalSession(tid));

	await disposeDaemonClient();
	await new Promise<void>((resolve) => stallServer.close(() => resolve()));
});

// A daemon that REJECTS the handshake is reachable and saying no — that's a
// permanent failure and must NOT invite the renderer's retry loop.
test("handshake-rejecting daemon yields a permanent error, not attach-retryable", async () => {
	const rejectSock = path.join(
		os.tmpdir(),
		`host-svc-stallretry-reject-${process.pid}.sock`,
	);
	const rejectServer = net.createServer((socket) => {
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				if ((frame.message as { type: string }).type === "hello") {
					socket.write(
						encodeFrame({ type: "error", message: "unsupported protocol" }),
					);
				}
			}
		});
	});
	await new Promise<void>((resolve) =>
		rejectServer.listen(rejectSock, resolve),
	);
	await disposeDaemonClient();
	process.env.SUPERSET_PTY_DAEMON_SOCKET = rejectSock;

	const tid = `stall-reject-${randomUUID().slice(0, 8)}`;
	const result = await dial(tid, `?workspaceId=${workspaceId}&create=1`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, undefined);
	}
	assert.ok(!isLiveTerminalSession(tid));

	await disposeDaemonClient();
	await new Promise<void>((resolve) => rejectServer.close(() => resolve()));
});

test("retrying the same ids after the daemon recovers attaches exactly once", async () => {
	await disposeDaemonClient();
	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-stallretry-test",
	});
	await server.listen();

	const created = await dial(createId, `?workspaceId=${workspaceId}&create=1`);
	assert.deepEqual(created, { kind: "attached" });
	assert.ok(isLiveTerminalSession(createId));
	assert.equal(
		listTerminalSessions({ workspaceId }).filter(
			(s) => s.terminalId === createId,
		).length,
		1,
	);

	const reattached = await dial(existingId, `?workspaceId=${workspaceId}`);
	assert.deepEqual(reattached, { kind: "attached" });
	assert.ok(isLiveTerminalSession(existingId));
});
