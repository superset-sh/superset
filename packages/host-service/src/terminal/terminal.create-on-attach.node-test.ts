import { closedPanes } from "../db/schema.ts";
import { paneRecoveryRouter } from "../trpc/router/pane-recovery/pane-recovery.ts";
import { reconcileMissingTerminalSessions } from "./reaper/reaper.ts";
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
import {
	hostAgentConfigs,
	projects,
	terminalAgentBindings,
	terminalSessions,
	workspaces,
} from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import {
	SqliteTerminalAgentBindingPersistence,
	TerminalAgentStore,
} from "../terminal-agents/index.ts";
import { terminalRouter } from "../trpc/router/terminal/terminal.ts";
import {
	type ResumeSessionDeps,
	restartAccountSessions,
} from "../trpc/router/terminal-agents/terminal-agents.ts";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	captureSessionRecoverySnapshot,
	createTerminalSessionInternal,
	disposeSessionAndWait,
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

test("cleanup before attach preserves a lost session's recovery path", async () => {
	const terminalId = randomUUID();
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "active",
			createdAt: Date.now() - 600_000,
		})
		.run();
	reconcileMissingTerminalSessions(db, [], new Map());
	assert.equal(
		db.query.terminalSessions
			.findFirst({ where: eq(terminalSessions.id, terminalId) })
			.sync()?.status,
		"active",
	);
	assert.deepEqual(await dial(terminalId, `?workspaceId=${workspaceId}`), {
		kind: "attached",
	});
	await disposeSessionAndWait(terminalId, db);
});

test("pending dispose blocks attach even while the row says active", async () => {
	const terminalId = randomUUID();
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			originWorkspaceId: workspaceId,
			status: "active",
			createdAt: Date.now(),
			disposeRequestedAt: Date.now(),
		})
		.run();
	const result = await dial(terminalId, `?workspaceId=${workspaceId}&create=1`);
	assert.equal(result.kind, "error");
	if (result.kind === "error") assert.equal(result.code, "session-gone");
	const daemon = await getDaemonClient();
	assert.ok(
		!(await daemon.list()).some(
			(session) => session.id === terminalId && session.alive,
		),
	);
});

test("dispose during an in-flight create wins without leaving a live shell", async () => {
	const terminalId = randomUUID();
	const daemon = await getDaemonClient();
	const originalOpen = daemon.open.bind(daemon);
	let release!: () => void;
	let entered!: () => void;
	const barrier = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	daemon.open = async (...args: Parameters<typeof daemon.open>) => {
		if (args[0] === terminalId) {
			entered();
			await barrier;
		}
		return originalOpen(...args);
	};
	try {
		const creating = createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
		});
		await started;
		const disposing = disposeSessionAndWait(terminalId, db);
		release();
		const result = await creating;
		assert.ok("error" in result);
		await disposing;
		assert.ok(!isLiveTerminalSession(terminalId));
		assert.equal(
			db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, terminalId) })
				.sync()?.status,
			"disposed",
		);
		assert.ok(
			!(await daemon.list()).some(
				(session) => session.id === terminalId && session.alive,
			),
		);
	} finally {
		release();
		daemon.open = originalOpen;
	}
});

function terminalCaller() {
	return terminalRouter.createCaller({
		isAuthenticated: true,
		organizationId: "test",
		db,
		terminalAgentStore: new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		),
	} as unknown as Parameters<typeof terminalRouter.createCaller>[0]);
}

test("account restart with real disposal preserves the conversation and launches a successor", async () => {
	const terminalId = randomUUID();
	const created = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
	});
	assert.ok(!("error" in created));
	db.insert(hostAgentConfigs)
		.values({
			id: randomUUID(),
			presetId: "claude",
			label: "Claude",
			command: "claude",
			promptTransport: "argv",
			resumeArgsJson: '["--resume"]',
			displayOrder: 0,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId,
			workspaceId,
			agentId: "claude",
			agentSessionId: "saved-conversation",
			startedAt: Date.now(),
			lastEventAt: Date.now(),
			lastEventType: "Stop",
		})
		.run();
	const launches: Parameters<ResumeSessionDeps["runAgent"]>[0][] = [];
	const broadcasts: Parameters<
		ResumeSessionDeps["eventBus"]["broadcastTerminalLifecycle"]
	>[0][] = [];
	const result = await restartAccountSessions(
		{
			db,
			terminalAgentStore: new TerminalAgentStore(
				new SqliteTerminalAgentBindingPersistence(db),
			),
			runAgent: async (input) => {
				launches.push(input);
				return { kind: "terminal", sessionId: "replacement", label: "Claude" };
			},
			disposeSession: (id) => disposeSessionAndWait(id, db),
			hasSession: () => null,
			eventBus: {
				broadcastTerminalLifecycle: (message) => broadcasts.push(message),
			},
		},
		"claude",
	);
	assert.deepEqual(result.restartedTerminalIds, [terminalId]);
	assert.equal(launches.length, 1);
	assert.equal(launches[0]?.resumeSessionId, "saved-conversation");
	assert.equal(broadcasts.length, 1);
	assert.equal(
		db.query.terminalAgentBindings
			.findFirst({ where: eq(terminalAgentBindings.terminalId, terminalId) })
			.sync()?.endReason,
		"resumed",
	);
	assert.ok(
		!(await (await getDaemonClient()).list()).some(
			(session) => session.id === terminalId && session.alive,
		),
	);
});

test("killSession cancels a pending create before its session row exists", async () => {
	const terminalId = randomUUID();
	const daemon = await getDaemonClient();
	const originalOpen = daemon.open.bind(daemon);
	let release!: () => void;
	let entered!: () => void;
	const barrier = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	daemon.open = async (...args: Parameters<typeof daemon.open>) => {
		if (args[0] === terminalId) {
			entered();
			await barrier;
		}
		return originalOpen(...args);
	};
	try {
		const creating = createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
		});
		await started;
		const killing = terminalCaller().killSession({ terminalId, workspaceId });
		const outcome = killing.then(
			() => null,
			(error) => error,
		);
		await new Promise((resolve) => setTimeout(resolve, 30));
		release();
		const created = await creating;
		assert.equal(await outcome, null);
		assert.ok("error" in created);
		assert.equal(
			db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, terminalId) })
				.sync()?.originWorkspaceId,
			workspaceId,
		);
		assert.ok(
			!(await daemon.list()).some(
				(session) => session.id === terminalId && session.alive,
			),
		);
		await terminalCaller().killSession({ terminalId, workspaceId });
	} finally {
		release();
		daemon.open = originalOpen;
		await disposeSessionAndWait(terminalId, db);
	}
});

test("killSession rejects another workspace and prevents creating a pre-cancelled id", async () => {
	const terminalId = randomUUID();
	const caller = terminalCaller();
	await assert.rejects(
		caller.killSession({ terminalId, workspaceId: randomUUID() }),
		{ code: "NOT_FOUND" },
	);
	assert.equal(
		db.query.terminalSessions
			.findFirst({ where: eq(terminalSessions.id, terminalId) })
			.sync(),
		undefined,
	);
	await caller.killSession({ terminalId, workspaceId });
	const result = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
	});
	assert.ok("error" in result);
	const otherTerminalId = randomUUID();
	db.insert(terminalSessions)
		.values({
			id: otherTerminalId,
			originWorkspaceId: null,
			status: "active",
			createdAt: Date.now(),
		})
		.run();
	await assert.rejects(
		caller.killSession({ terminalId: otherTerminalId, workspaceId }),
		{ code: "FORBIDDEN" },
	);
	assert.equal(
		db.query.terminalSessions
			.findFirst({ where: eq(terminalSessions.id, otherTerminalId) })
			.sync()?.disposeRequestedAt,
		null,
	);
});

test("explicit kill ends an agent binding as disposed and blocks reuse", async () => {
	const terminalId = randomUUID();
	const created = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
	});
	assert.ok(!("error" in created));
	db.insert(terminalAgentBindings)
		.values({
			terminalId,
			workspaceId,
			agentId: "claude",
			agentSessionId: "do-not-resume",
			startedAt: Date.now(),
			lastEventAt: Date.now(),
			lastEventType: "Stop",
		})
		.run();
	await terminalCaller().killSession({ terminalId, workspaceId });
	assert.equal(
		db.query.terminalAgentBindings
			.findFirst({ where: eq(terminalAgentBindings.terminalId, terminalId) })
			.sync()?.endReason,
		"disposed",
	);
	assert.ok(
		"error" in
			(await createTerminalSessionInternal({ terminalId, workspaceId, db })),
	);
	assert.ok(
		!(await (await getDaemonClient()).list()).some(
			(session) => session.id === terminalId && session.alive,
		),
	);
});

for (const queued of [false, true]) {
	test(`pending creation rejects a foreign workspace kill${queued ? " with another create queued" : ""}`, async () => {
		const terminalId = randomUUID();
		const foreignWorkspaceId = randomUUID();
		const owner = db.query.workspaces
			.findFirst({ where: eq(workspaces.id, workspaceId) })
			.sync();
		assert.ok(owner);
		db.insert(workspaces)
			.values({
				id: foreignWorkspaceId,
				projectId: owner.projectId,
				worktreePath: owner.worktreePath,
				branch: "foreign",
			})
			.run();
		const daemon = await getDaemonClient();
		const originalOpen = daemon.open.bind(daemon);
		let release!: () => void;
		let entered!: () => void;
		const barrier = new Promise<void>((resolve) => {
			release = resolve;
		});
		const started = new Promise<void>((resolve) => {
			entered = resolve;
		});
		daemon.open = async (...args: Parameters<typeof daemon.open>) => {
			if (args[0] === terminalId) {
				entered();
				await barrier;
			}
			return originalOpen(...args);
		};
		try {
			const creating = createTerminalSessionInternal({
				terminalId,
				workspaceId,
				db,
			});
			await started;
			const queuedCreate = queued
				? createTerminalSessionInternal({ terminalId, workspaceId, db })
				: null;
			const killing = terminalCaller()
				.killSession({ terminalId, workspaceId: foreignWorkspaceId })
				.then(
					() => null,
					(error) => error,
				);
			await new Promise((resolve) => setTimeout(resolve, 30));
			release();
			const results = await Promise.all([creating, queuedCreate]);
			assert.equal((await killing)?.code, "FORBIDDEN");
			assert.ok(results.every((result) => !result || !("error" in result)));
			const row = db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, terminalId) })
				.sync();
			assert.equal(row?.originWorkspaceId, workspaceId);
			assert.equal(row?.disposeRequestedAt, null);
			assert.ok(
				(await daemon.list()).some(
					(session) => session.id === terminalId && session.alive,
				),
			);
		} finally {
			release();
			daemon.open = originalOpen;
			await disposeSessionAndWait(terminalId, db);
		}
	});
}

test("same-owner cancellation covers a create queued behind a failed create", async () => {
	const terminalId = randomUUID();
	const daemon = await getDaemonClient();
	const originalOpen = daemon.open.bind(daemon);
	let release!: () => void;
	let entered!: () => void;
	const barrier = new Promise<void>((resolve) => {
		release = resolve;
	});
	const started = new Promise<void>((resolve) => {
		entered = resolve;
	});
	daemon.open = async (...args: Parameters<typeof daemon.open>) => {
		if (args[0] === terminalId) {
			entered();
			await barrier;
			throw new Error("injected create failure");
		}
		return originalOpen(...args);
	};
	try {
		const creating = createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
		});
		await started;
		const queuedCreate = createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
		});
		const killing = terminalCaller().killSession({ terminalId, workspaceId });
		const outcome = killing.then(
			() => null,
			(error) => error,
		);
		await new Promise((resolve) => setTimeout(resolve, 30));
		release();
		assert.ok("error" in (await creating));
		assert.ok("error" in (await queuedCreate));
		assert.equal(await outcome, null);
		assert.equal(
			db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, terminalId) })
				.sync()?.status,
			"disposed",
		);
		assert.ok(
			!(await daemon.list()).some(
				(session) => session.id === terminalId && session.alive,
			),
		);
	} finally {
		release();
		daemon.open = originalOpen;
		await disposeSessionAndWait(terminalId, db);
	}
});

test("failed creation releases pending ownership for a different workspace", async () => {
	const terminalId = randomUUID();
	const nextWorkspaceId = randomUUID();
	const owner = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	assert.ok(owner);
	db.insert(workspaces)
		.values({
			id: nextWorkspaceId,
			projectId: owner.projectId,
			worktreePath: owner.worktreePath,
			branch: "next",
		})
		.run();
	const daemon = await getDaemonClient();
	const originalOpen = daemon.open.bind(daemon);
	daemon.open = async (...args: Parameters<typeof daemon.open>) => {
		if (args[0] === terminalId) throw new Error("injected create failure");
		return originalOpen(...args);
	};
	try {
		assert.ok(
			"error" in
				(await createTerminalSessionInternal({ terminalId, workspaceId, db })),
		);
		assert.equal(
			db.query.terminalSessions
				.findFirst({ where: eq(terminalSessions.id, terminalId) })
				.sync(),
			undefined,
		);
		daemon.open = originalOpen;
		const created = await createTerminalSessionInternal({
			terminalId,
			workspaceId: nextWorkspaceId,
			db,
		});
		assert.ok(!("error" in created));
		await assert.rejects(
			terminalCaller().killSession({ terminalId, workspaceId }),
			{ code: "FORBIDDEN" },
		);
		await terminalCaller().killSession({
			terminalId,
			workspaceId: nextWorkspaceId,
		});
	} finally {
		daemon.open = originalOpen;
		await disposeSessionAndWait(terminalId, db);
	}
});

async function recoveryAttach(terminalId: string, acknowledge = true) {
	return new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
		const messages: Array<Record<string, unknown>> = [];
		const ws = new WebSocket(
			`ws://127.0.0.1:${httpPort}/terminal/${terminalId}?workspaceId=${workspaceId}&seq=new&history=1`,
		);
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error("Recovery attach timed out"));
		}, 10000);
		ws.addEventListener("message", (event) => {
			if (typeof event.data !== "string") return;
			const message = JSON.parse(event.data);
			messages.push(message);
			if (message.type === "synced") {
				const recovery = messages.find((m) => m.type === "recovery");
				if (acknowledge && recovery)
					ws.send(
						JSON.stringify({ type: "recovery-restored", id: recovery.id }),
					);
				setTimeout(() => {
					clearTimeout(timer);
					ws.close();
					resolve(messages);
				}, 50);
			}
		});
		ws.addEventListener("error", () => {
			clearTimeout(timer);
			reject(new Error("Recovery websocket failed"));
		});
	});
}

function recoveryCaller() {
	return paneRecoveryRouter.createCaller({
		db,
		isAuthenticated: true,
		terminalAgentStore: new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		),
	} as Parameters<typeof paneRecoveryRouter.createCaller>[0]);
}
async function recoveryTerminal() {
	const id = `recovery-${randomUUID()}`;
	assert.deepEqual(await dial(id, `?workspaceId=${workspaceId}&create=1`), {
		kind: "attached",
	});
	return id;
}
function closeEntry(terminalId: string) {
	return {
		id: randomUUID(),
		paneId: randomUUID(),
		title: "Recovery test",
		pane: { kind: "terminal" as const, terminalId, terminate: true },
	};
}
test("deleting kills immediately; restore uses a new process and retries reuse its ID", async () => {
	const terminalId = await recoveryTerminal(),
		caller = recoveryCaller(),
		entry = closeEntry(terminalId),
		daemon = await getDaemonClient();
	const before = (await daemon.list()).find((s) => s.id === terminalId);
	assert.ok(before);
	await caller.close({ workspaceId, entries: [entry] });
	assert.ok(!(await daemon.list()).some((s) => s.id === terminalId && s.alive));
	const row = db.query.terminalSessions
		.findFirst({ where: eq(terminalSessions.id, terminalId) })
		.sync();
	assert.equal(row?.status, "disposed");
	assert.ok(row?.disposeRequestedAt);
	await caller.close({ workspaceId, entries: [entry] });
	const result = await caller.restore({ workspaceId, id: entry.id });
	assert.equal(result.entry.freshShell, true);
	assert.notEqual(result.entry.descriptor.terminalId, terminalId);
	assert.deepEqual(await caller.restore({ workspaceId, id: entry.id }), result);
	assert.ok(result.entry.descriptor.terminalId);
	assert.equal(
		(
			await dial(
				result.entry.descriptor.terminalId,
				`?workspaceId=${workspaceId}&create=1`,
			)
		).kind,
		"attached",
	);
	const restored = (await daemon.list()).find(
		(s) => s.id === result.entry.descriptor.terminalId,
	);
	assert.ok(restored?.alive);
	assert.notEqual(restored.pid, before.pid);
	assert.equal(
		(await dial(terminalId, `?workspaceId=${workspaceId}&create=1`)).kind,
		"error",
	);
	await recoveryAttach(result.entry.descriptor.terminalId);
	assert.ok(
		!(await caller.list({ workspaceId })).some((row) => row.id === entry.id),
	);
	await assert.rejects(() => caller.close({ workspaceId, entries: [entry] }));
});
for (const status of ["disposed", "exited"] as const) {
	test(`restore replaces a ${status} replacement and preserves archived history`, async () => {
		const terminalId = await recoveryTerminal();
		const caller = recoveryCaller();
		const entry = {
			...closeEntry(terminalId),
			pane: {
				kind: "terminal" as const,
				terminalId,
				terminate: true,
				snapshot: {
					version: 1 as const,
					ansi: "RETRY_HISTORY",
					cols: 80,
					rows: 24,
				},
			},
		};
		await caller.close({ workspaceId, entries: [entry] });
		const first = (await caller.restore({ workspaceId, id: entry.id })).entry
			.descriptor.terminalId;
		assert.ok(first);
		await disposeSessionAndWait(first, db);
		if (status === "exited")
			db.update(terminalSessions)
				.set({ status: "exited", disposeRequestedAt: null })
				.where(eq(terminalSessions.id, first))
				.run();
		const second = (await caller.restore({ workspaceId, id: entry.id })).entry
			.descriptor.terminalId;
		assert.ok(second);
		assert.notEqual(second, first);
		assert.notEqual(second, terminalId);
		assert.equal(
			(await caller.restore({ workspaceId, id: entry.id })).entry.descriptor
				.terminalId,
			second,
		);
		const messages = await recoveryAttach(second);
		assert.equal(
			(
				messages.find((message) => message.type === "recovery")?.snapshot as {
					ansi: string;
				}
			)?.ansi,
			"RETRY_HISTORY",
		);
		await disposeSessionAndWait(second, db);
	});
}

test("recovery close clears live agent state and publishes the normal disposal change", async () => {
	const terminalId = await recoveryTerminal();
	const store = new TerminalAgentStore(
		new SqliteTerminalAgentBindingPersistence(db),
	);
	store.recordEvent({
		terminalId,
		workspaceId,
		agentId: "claude",
		agentSessionId: "closed-conversation",
		eventType: "Start",
		occurredAt: Date.now(),
	});
	store.recordSubagentEvent({
		terminalId,
		workspaceId,
		subagentId: "closed-child",
		eventType: "SubagentStart",
		occurredAt: Date.now(),
	});
	assert.ok(store.getSubagent(terminalId, "closed-child"));
	const changes: string[] = [];
	store.on("change", (id: string) => changes.push(id));
	const caller = paneRecoveryRouter.createCaller({
		db,
		isAuthenticated: true,
		terminalAgentStore: store,
	} as Parameters<typeof paneRecoveryRouter.createCaller>[0]);
	await caller.close({ workspaceId, entries: [closeEntry(terminalId)] });
	assert.equal(store.get(terminalId), undefined);
	assert.equal(store.getSubagent(terminalId, "closed-child"), undefined);
	assert.deepEqual(changes, [workspaceId]);
	const binding = db.query.terminalAgentBindings
		.findFirst({ where: eq(terminalAgentBindings.terminalId, terminalId) })
		.sync();
	assert.equal(binding?.endReason, "disposed");
	assert.equal(binding?.agentSessionId, "closed-conversation");
});

test("close before create-on-attach stamps permanent disposal", async () => {
	const terminalId = randomUUID(),
		entry = closeEntry(terminalId),
		caller = recoveryCaller();
	await caller.close({ workspaceId, entries: [entry] });
	assert.equal(
		(await dial(terminalId, `?workspaceId=${workspaceId}&create=1`)).kind,
		"error",
	);
	assert.notEqual(
		(await caller.restore({ workspaceId, id: entry.id })).entry.descriptor
			.terminalId,
		terminalId,
	);
});
test("concurrent restore requests allocate one new terminal ID", async () => {
	const entry = closeEntry(randomUUID()),
		caller = recoveryCaller();
	await caller.close({ workspaceId, entries: [entry] });
	const results = await Promise.all(
		Array.from({ length: 12 }, () =>
			caller.restore({ workspaceId, id: entry.id }),
		),
	);
	assert.equal(
		new Set(results.map((r) => r.entry.descriptor.terminalId)).size,
		1,
	);
	assert.notEqual(
		results[0]?.entry.descriptor.terminalId,
		entry.pane.terminalId,
	);
});
test("closing one of several panes preserves the shared terminal", async () => {
	const terminalId = await recoveryTerminal(),
		entry = closeEntry(terminalId),
		caller = recoveryCaller();
	await caller.close({
		workspaceId,
		entries: [{ ...entry, pane: { ...entry.pane, terminate: false } }],
	});
	assert.ok(
		(await (await getDaemonClient()).list()).some(
			(s) => s.id === terminalId && s.alive,
		),
	);
	const restored = await caller.restore({ workspaceId, id: entry.id });
	assert.equal(restored.entry.descriptor.terminalId, terminalId);
	assert.equal(restored.entry.freshShell, false);
});
test("repeated shared-terminal recovery acknowledges each new archive", async () => {
	const terminalId = await recoveryTerminal();
	const caller = recoveryCaller();
	for (let attempt = 0; attempt < 3; attempt++) {
		const entry = closeEntry(terminalId);
		await caller.close({
			workspaceId,
			entries: [{ ...entry, pane: { ...entry.pane, terminate: false } }],
		});
		await caller.restore({ workspaceId, id: entry.id });
		const messages = await recoveryAttach(terminalId);
		assert.equal(
			messages.find((message) => message.type === "recovery")?.id,
			entry.id,
		);
		assert.ok(
			!(await caller.list({ workspaceId })).some((row) => row.id === entry.id),
		);
	}
});
test("shared-view recovery cannot resurrect a subsequently killed terminal", async () => {
	const terminalId = await recoveryTerminal(),
		entry = closeEntry(terminalId),
		caller = recoveryCaller();
	await caller.close({
		workspaceId,
		entries: [{ ...entry, pane: { ...entry.pane, terminate: false } }],
	});
	await disposeSessionAndWait(terminalId, db);
	assert.notEqual(
		(await caller.restore({ workspaceId, id: entry.id })).entry.descriptor
			.terminalId,
		terminalId,
	);
});
test("batch preflight rejects foreign ownership before killing valid terminals", async () => {
	const terminalId = await recoveryTerminal(),
		entry = closeEntry(terminalId),
		caller = recoveryCaller();
	const workspace = db.query.workspaces
		.findFirst({ where: eq(workspaces.id, workspaceId) })
		.sync();
	assert.ok(workspace);
	const other = randomUUID();
	db.insert(workspaces)
		.values({
			id: other,
			projectId: workspace.projectId,
			worktreePath: workspace.worktreePath,
			branch: "foreign",
		})
		.run();
	const foreign = randomUUID();
	db.insert(terminalSessions)
		.values({ id: foreign, originWorkspaceId: other })
		.run();
	await assert.rejects(() =>
		caller.close({ workspaceId, entries: [entry, closeEntry(foreign)] }),
	);
	assert.equal(
		db.query.closedPanes
			.findFirst({ where: eq(closedPanes.id, entry.id) })
			.sync(),
		undefined,
	);
	assert.ok(
		(await (await getDaemonClient()).list()).some(
			(s) => s.id === terminalId && s.alive,
		),
	);
	await caller.close({ workspaceId, entries: [entry] });
	await assert.rejects(() =>
		caller.restore({ workspaceId: other, id: entry.id }),
	);
	assert.equal((await caller.list({ workspaceId: other })).length, 0);
});
test("file and browser descriptors preserve custom titles and expire", async () => {
	const caller = recoveryCaller();
	for (const pane of [
		{ kind: "file" as const, filePath: "/tmp/recovery.ts" },
		{ kind: "browser" as const, url: "https://example.com/path" },
	]) {
		const entry = {
			id: randomUUID(),
			paneId: randomUUID(),
			title: "test",
			titleOverride: "Pinned name",
			pane,
		};
		await caller.close({ workspaceId, entries: [entry] });
		const result = await caller.restore({ workspaceId, id: entry.id });
		assert.equal(result.entry.kind, pane.kind);
		assert.equal(result.entry.descriptor.titleOverride, "Pinned name");
		db.update(closedPanes)
			.set({ expiresAt: Date.now() - 1 })
			.where(eq(closedPanes.id, entry.id))
			.run();
		await assert.rejects(() => caller.restore({ workspaceId, id: entry.id }));
	}
});
test("unsafe browser schemes are rejected", async () => {
	await assert.rejects(() =>
		recoveryCaller().close({
			workspaceId,
			entries: [
				{
					id: randomUUID(),
					paneId: "browser",
					title: "",
					pane: { kind: "browser", url: "javascript:alert(1)" },
				},
			],
		}),
	);
});
test("history is bounded to 100 records and exposes the latest 20", async () => {
	const caller = recoveryCaller();
	for (let batch = 0; batch < 6; batch++)
		await caller.close({
			workspaceId,
			entries: Array.from({ length: 20 }, () => ({
				id: randomUUID(),
				paneId: randomUUID(),
				title: "History bound",
				pane: { kind: "file" as const, filePath: "/tmp/recovery.ts" },
			})),
		});
	assert.equal(
		db
			.select()
			.from(closedPanes)
			.where(eq(closedPanes.workspaceId, workspaceId))
			.all().length,
		100,
	);
	assert.equal((await caller.list({ workspaceId })).length, 20);
});

test("full history is durable and delivered before output; only an attached acknowledgement consumes it", async () => {
	const caller = recoveryCaller();
	const terminalId = await recoveryTerminal();
	const entry = closeEntry(terminalId);
	const snapshot = {
		version: 1 as const,
		ansi: "\x1b[31mnormal history\x1b[0m\r\n\x1b[?1049hClaude conversation",
		cols: 132,
		rows: 42,
	};
	await caller.close({
		workspaceId,
		entries: [{ ...entry, pane: { ...entry.pane, snapshot } }],
	});
	assert.equal(
		(await caller.list({ workspaceId })).find((row) => row.id === entry.id)
			?.descriptor.snapshot,
		undefined,
	);
	const restored = await caller.restore({ workspaceId, id: entry.id });
	const newId = restored.entry.descriptor.terminalId;
	assert.ok(newId);
	assert.equal(restored.entry.descriptor.snapshot, undefined);
	await caller.acknowledge({ workspaceId, id: entry.id });
	assert.ok(
		(await caller.list({ workspaceId })).some((row) => row.id === entry.id),
	);
	__resetSessionsForTesting();
	const messages = await recoveryAttach(newId, false);
	assert.equal(messages[0]?.type, "recovery");
	assert.deepEqual(messages[0]?.snapshot, {
		...snapshot,
		cwd: path.join(TEST_HOME, "worktree"),
	});
	assert.ok(
		(await caller.list({ workspaceId })).some((row) => row.id === entry.id),
	);
	await recoveryAttach(newId);
	assert.ok(
		!(await caller.list({ workspaceId })).some((row) => row.id === entry.id),
	);
	const remount = await recoveryAttach(newId);
	assert.deepEqual(remount[0]?.snapshot, messages[0]?.snapshot);
	await assert.rejects(() =>
		caller.close({
			workspaceId,
			entries: [
				{
					...closeEntry(terminalId),
					pane: {
						...entry.pane,
						snapshot: { ...snapshot, ansi: "x".repeat(5 * 1024 * 1024 + 1) },
					},
				},
			],
		}),
	);
});

test("host checkpoint preserves a detached terminal without a renderer snapshot", async () => {
	const caller = recoveryCaller();
	const terminalId = await recoveryTerminal();
	const daemon = await getDaemonClient();
	await new Promise((resolve) => setTimeout(resolve, 500));
	daemon.input(
		terminalId,
		Buffer.from(
			"printf '\\033[31mHOST_NORMAL\\033[0m\\r\\n\\033[?1049hHOST_ALTERNATE';\r",
		),
	);
	let captured = false;
	for (let attempt = 0; attempt < 100; attempt++) {
		const snapshot = await captureSessionRecoverySnapshot({
			terminalId,
			workspaceId,
			db,
		});
		if (
			snapshot?.ansi.includes("HOST_ALTERNATE") &&
			snapshot.ansi.includes("\x1b[?1049h")
		) {
			captured = true;
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	assert.ok(captured);
	const entry = closeEntry(terminalId);
	await caller.close({ workspaceId, entries: [entry] });
	const restored = await caller.restore({ workspaceId, id: entry.id });
	__resetSessionsForTesting();
	const restoredId = restored.entry.descriptor.terminalId;
	assert.ok(restoredId);
	const messages = await recoveryAttach(restoredId);
	const snapshot = messages[0]?.snapshot as { ansi: string };
	assert.ok(snapshot.ansi.includes("HOST_NORMAL"));
	assert.ok(snapshot.ansi.includes("HOST_ALTERNATE"));
	assert.ok(snapshot.ansi.includes("\x1b[?1049h"));
});

test("deleted agent restores through the real launcher with its resume session ID exactly once", async () => {
	const terminalId = await recoveryTerminal();
	const configId = `custom:${randomUUID()}` as const;
	const script = path.join(TEST_HOME, "recovery-agent");
	const argsFile = path.join(TEST_HOME, "recovery-agent-args");
	fs.writeFileSync(
		script,
		`#!/bin/sh\nprintf '%s\\n' "$@" >> "${argsFile}"\nexec sleep 60\n`,
		{ mode: 0o755 },
	);
	db.insert(hostAgentConfigs)
		.values({
			id: configId,
			presetId: "claude",
			label: "Recovery agent",
			command: script,
			promptTransport: "argv",
			resumeArgsJson: '["--resume"]',
			displayOrder: 99,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId,
			workspaceId,
			agentId: "claude",
			definitionId: configId,
			agentSessionId: "recovery-conversation",
			startedAt: Date.now(),
			lastEventAt: Date.now(),
			lastEventType: "Stop",
		})
		.run();
	const store = new TerminalAgentStore(
		new SqliteTerminalAgentBindingPersistence(db),
	);
	const eventBus = new Proxy({}, { get: () => () => {} }) as EventBus;
	const caller = paneRecoveryRouter.createCaller({
		db,
		isAuthenticated: true,
		terminalAgentStore: store,
		eventBus,
	} as Parameters<typeof paneRecoveryRouter.createCaller>[0]);
	const entry = closeEntry(terminalId);
	await caller.close({ workspaceId, entries: [entry] });
	assert.equal(fs.existsSync(argsFile), false);
	const [first, second] = await Promise.all([
		caller.restore({ workspaceId, id: entry.id }),
		caller.restore({ workspaceId, id: entry.id }),
	]);
	const restoredId = first.entry.descriptor.terminalId;
	assert.ok(restoredId);
	assert.equal(second.entry.descriptor.terminalId, restoredId);
	assert.notEqual(restoredId, terminalId);
	try {
		for (let attempt = 0; attempt < 100 && !fs.existsSync(argsFile); attempt++)
			await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal(
			fs.readFileSync(argsFile, "utf8"),
			"--resume\nrecovery-conversation\n",
		);
		assert.equal(
			db.query.terminalAgentBindings
				.findFirst({
					where: eq(terminalAgentBindings.terminalId, terminalId),
				})
				.sync()?.resumedIntoTerminalId,
			restoredId,
		);
		assert.equal(
			(await caller.restore({ workspaceId, id: entry.id })).entry.descriptor
				.terminalId,
			restoredId,
		);
		assert.equal(
			fs.readFileSync(argsFile, "utf8"),
			"--resume\nrecovery-conversation\n",
		);
		store.recordEvent({
			terminalId: restoredId,
			workspaceId,
			agentId: "claude",
			eventType: "Stop",
			occurredAt: Date.now(),
		});
		await caller.close({ workspaceId, entries: [closeEntry(restoredId)] });
		const retried = (await caller.restore({ workspaceId, id: entry.id })).entry
			.descriptor.terminalId;
		assert.ok(retried);
		assert.notEqual(retried, restoredId);
		assert.equal(
			(await caller.restore({ workspaceId, id: entry.id })).entry.descriptor
				.terminalId,
			retried,
		);
		try {
			for (
				let attempt = 0;
				attempt < 100 &&
				fs.readFileSync(argsFile, "utf8").split("--resume").length < 3;
				attempt++
			)
				await new Promise((resolve) => setTimeout(resolve, 50));
			assert.equal(
				fs.readFileSync(argsFile, "utf8"),
				"--resume\nrecovery-conversation\n--resume\nrecovery-conversation\n",
			);
		} finally {
			await disposeSessionAndWait(retried, db);
		}
	} finally {
		await disposeSessionAndWait(restoredId, db);
	}
});
