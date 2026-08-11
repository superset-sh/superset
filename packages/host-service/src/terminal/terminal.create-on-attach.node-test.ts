// create-on-attach: a WS attach carrying `create=1` + `workspaceId` creates
// the session when no session row exists, so the renderer can insert a
// terminal pane optimistically instead of pre-awaiting an HTTP mutation that
// starves in Chromium's 6-per-origin socket pool under load.
//
// Harness: real in-process pty-daemon and the real host-service WS route
// (same shape as terminal.replay-gap.repro.node-test.ts).
//
// Run:
//   cd packages/host-service && node --experimental-strip-types --test \
//     src/terminal/terminal.create-on-attach.node-test.ts

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Server } from "@superset/pty-daemon";
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
const TEST_HOME = path.join(
	os.tmpdir(),
	`host-svc-createattach-${process.pid}`,
);
const SOCK = path.join(
	os.tmpdir(),
	`host-svc-createattach-${process.pid}.sock`,
);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

let server: Server;
let db: HostDb;
let workspaceId: string;
let httpPort: number;
let httpServer: ReturnType<typeof serve>;

type FirstResult =
	| { kind: "attached" }
	| { kind: "error"; message: string; code?: string };

/** Dial the terminal WS and resolve with the first protocol outcome. */
function dial(terminalId: string, query: string): Promise<FirstResult> {
	return new Promise((resolve, reject) => {
		const ws = new WebSocket(
			`ws://127.0.0.1:${httpPort}/terminal/${terminalId}${query}`,
		);
		ws.binaryType = "arraybuffer";
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error("attach timeout"));
		}, 15_000);
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

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-createattach-test",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-createattach-test";
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
	await server.close();
	await new Promise<void>((resolve) => httpServer.close(() => resolve()));
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

test("attach with create=1 creates the session for a brand-new id", async () => {
	const terminalId = `create-attach-${randomUUID().slice(0, 8)}`;
	const result = await dial(terminalId, `?workspaceId=${workspaceId}&create=1`);
	assert.deepEqual(result, { kind: "attached" });
	assert.ok(isLiveTerminalSession(terminalId));

	// The session must be persisted, not just in-memory — the row is what
	// future attaches (and the session-gone contract) key off after restarts.
	const row = db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, terminalId) })
		.sync();
	assert.ok(row);
	assert.equal(row.originWorkspaceId, workspaceId);
	assert.equal(row.status, "active");

	// The session now exists like any other: a plain re-attach works.
	const reattach = await dial(terminalId, `?workspaceId=${workspaceId}`);
	assert.deepEqual(reattach, { kind: "attached" });
});

test("attach without create=1 keeps the session-gone contract", async () => {
	const terminalId = `no-create-${randomUUID().slice(0, 8)}`;
	const result = await dial(terminalId, `?workspaceId=${workspaceId}`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, "session-gone");
	}
	assert.ok(!isLiveTerminalSession(terminalId));
});

test("create=1 without workspaceId is refused", async () => {
	const terminalId = `no-workspace-${randomUUID().slice(0, 8)}`;
	const result = await dial(terminalId, "?create=1");
	assert.equal(result.kind, "error");
	assert.ok(!isLiveTerminalSession(terminalId));
});

// create-on-attach must only fire when NO session row exists — a stale
// persisted `createOnAttach` flag on a pane whose session has since exited
// or been disposed must not silently respawn it.
test("create=1 against an exited session row keeps session-gone", async () => {
	const terminalId = `exited-${randomUUID().slice(0, 8)}`;
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "exited",
		})
		.run();
	const result = await dial(terminalId, `?workspaceId=${workspaceId}&create=1`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, "session-gone");
	}
	assert.ok(!isLiveTerminalSession(terminalId));
});

test("create=1 against a disposed session row keeps session-gone", async () => {
	const terminalId = `disposed-${randomUUID().slice(0, 8)}`;
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "disposed",
		})
		.run();
	const result = await dial(terminalId, `?workspaceId=${workspaceId}&create=1`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") {
		assert.equal(result.code, "session-gone");
	}
	assert.ok(!isLiveTerminalSession(terminalId));
});

test("create=1 with an unknown workspaceId errors instead of attaching", async () => {
	const terminalId = `bad-workspace-${randomUUID().slice(0, 8)}`;
	const result = await dial(
		terminalId,
		`?workspaceId=${randomUUID()}&create=1`,
	);
	assert.equal(result.kind, "error");
	assert.ok(!isLiveTerminalSession(terminalId));
});

test("concurrent create=1 dials from different workspaces don't share a shell", async () => {
	const otherWorkspaceId = randomUUID();
	const otherWorktree = path.join(TEST_HOME, "worktree-b");
	fs.mkdirSync(otherWorktree, { recursive: true });
	const otherProjectId = randomUUID();
	db.insert(projects)
		.values({ id: otherProjectId, repoPath: otherWorktree })
		.run();
	db.insert(workspaces)
		.values({
			id: otherWorkspaceId,
			projectId: otherProjectId,
			worktreePath: otherWorktree,
			branch: "main",
		})
		.run();

	const terminalId = `cross-workspace-${randomUUID().slice(0, 8)}`;
	const results = await Promise.all([
		dial(terminalId, `?workspaceId=${workspaceId}&create=1`),
		dial(terminalId, `?workspaceId=${otherWorkspaceId}&create=1`),
	]);
	const attached = results.filter((r) => r.kind === "attached");
	assert.equal(attached.length, 1);
	const failure = results.find((r) => r.kind === "error");
	assert.ok(failure);
	if (failure.kind === "error") {
		assert.match(failure.message, /belongs to workspace/);
	}
});

test("concurrent create=1 attaches share one session", async () => {
	const terminalId = `concurrent-${randomUUID().slice(0, 8)}`;
	const query = `?workspaceId=${workspaceId}&create=1`;
	const results = await Promise.all([
		dial(terminalId, query),
		dial(terminalId, query),
		dial(terminalId, query),
	]);
	for (const result of results) {
		assert.deepEqual(result, { kind: "attached" });
	}
	const matching = listTerminalSessions({ workspaceId }).filter(
		(session) => session.terminalId === terminalId,
	);
	assert.equal(matching.length, 1);
});
