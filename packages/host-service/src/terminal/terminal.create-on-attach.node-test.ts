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
	restartAgentSessions,
} from "../trpc/router/terminal-agents/terminal-agents.ts";
import {
	disposeDaemonClient,
	getDaemonClient,
} from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
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

for (const provider of ["claude", "gemini"] as const) {
	test(`${provider} restart with real disposal preserves the conversation and launches a successor`, async () => {
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
				presetId: provider,
				label: "Claude",
				command: provider,
				promptTransport: "argv",
				resumeArgsJson: '["--resume"]',
				displayOrder: 0,
			})
			.run();
		db.insert(terminalAgentBindings)
			.values({
				terminalId,
				workspaceId,
				agentId: provider,
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
		const deps: ResumeSessionDeps = {
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
		};
		const result =
			provider === "claude"
				? await restartAccountSessions(deps, provider)
				: await restartAgentSessions(deps, [terminalId]);
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
}

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
