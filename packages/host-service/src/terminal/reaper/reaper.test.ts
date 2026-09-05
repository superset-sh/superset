import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../db/index.ts";
import * as schema from "../../db/schema.ts";
import { terminalAgentBindings, terminalSessions } from "../../db/schema.ts";
import {
	claimResumeCandidateBinding,
	findResumeCandidateBinding,
	markTerminalAgentBindingEnded,
} from "../../terminal-agents/persistence.ts";
import { markTerminalSessionSuspended } from "../terminal.ts";
import {
	ARCHIVE_SUSPEND_GRACE_MS,
	loadArchivedWorkspaces,
	markStaleActiveRows,
	PORT_SCAN_WARMUP_DELAYS_MS,
	planArchivedSuspends,
	planPortScanSync,
	planStaleActiveRows,
	REAP_INTERVAL_MS,
	STALE_ACTIVE_GRACE_MS,
	shouldReapRow,
} from "./reaper.ts";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../drizzle");

const noneLive = () => false;

describe("port-scan warm-up schedule", () => {
	it("re-syncs multiple times after startup so ports recover without a reap tick", () => {
		expect(PORT_SCAN_WARMUP_DELAYS_MS.length).toBeGreaterThanOrEqual(3);
	});

	it("runs strictly increasing offsets", () => {
		for (let i = 1; i < PORT_SCAN_WARMUP_DELAYS_MS.length; i += 1) {
			expect(PORT_SCAN_WARMUP_DELAYS_MS[i]).toBeGreaterThan(
				PORT_SCAN_WARMUP_DELAYS_MS[i - 1] as number,
			);
		}
	});

	it("fully precedes the first scheduled reap so it covers the gap", () => {
		// Every warm-up must fire before the 5-minute reap would otherwise be the
		// first re-sync — that's the window this fix closes.
		for (const delay of PORT_SCAN_WARMUP_DELAYS_MS) {
			expect(delay).toBeLessThan(REAP_INTERVAL_MS);
		}
	});
});

describe("planPortScanSync", () => {
	it("registers alive daemon sessions that map to an active workspace row", () => {
		const plan = planPortScanSync({
			liveSessions: [{ id: "term-1", pid: 4242 }],
			rowById: new Map([
				["term-1", { status: "active", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: [],
			isLive: noneLive,
		});

		expect(plan.register).toEqual([
			{ terminalId: "term-1", workspaceId: "ws-1", pid: 4242 },
		]);
		expect(plan.unregister).toEqual([]);
	});

	it("skips sessions already owned by a live in-memory session", () => {
		const plan = planPortScanSync({
			liveSessions: [{ id: "term-1", pid: 4242 }],
			rowById: new Map([
				["term-1", { status: "active", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: [],
			isLive: (id) => id === "term-1",
		});

		expect(plan.register).toEqual([]);
	});

	it("skips sessions without a row, without a workspace, or not active", () => {
		const plan = planPortScanSync({
			liveSessions: [
				{ id: "rowless", pid: 1 },
				{ id: "no-workspace", pid: 2 },
				{ id: "exited", pid: 3 },
				{ id: "disposed", pid: 4 },
			],
			rowById: new Map([
				["no-workspace", { status: "active", originWorkspaceId: null }],
				["exited", { status: "exited", originWorkspaceId: "ws-1" }],
				["disposed", { status: "disposed", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: [],
			isLive: noneLive,
		});

		expect(plan.register).toEqual([]);
	});

	it("unregisters scanned terminals the daemon no longer reports", () => {
		const plan = planPortScanSync({
			liveSessions: [{ id: "term-1", pid: 4242 }],
			rowById: new Map([
				["term-1", { status: "active", originWorkspaceId: "ws-1" }],
			]),
			registeredTerminalIds: ["term-1", "dead-term"],
			isLive: noneLive,
		});

		expect(plan.unregister).toEqual(["dead-term"]);
	});

	it("clears every adopted scan when the daemon reports no live sessions", () => {
		const plan = planPortScanSync({
			liveSessions: [],
			rowById: new Map(),
			registeredTerminalIds: ["term-1", "term-2"],
			isLive: noneLive,
		});

		expect(plan.unregister).toEqual(["term-1", "term-2"]);
	});

	it("keeps scanning a renderer-attached session momentarily absent from daemon.list", () => {
		const plan = planPortScanSync({
			liveSessions: [],
			rowById: new Map(),
			registeredTerminalIds: ["attached-term"],
			isLive: (id) => id === "attached-term",
		});

		expect(plan.unregister).toEqual([]);
	});
});

describe("shouldReapRow", () => {
	it("reaps rows whose dispose was requested but never confirmed", () => {
		expect(
			shouldReapRow({
				status: "active",
				originWorkspaceId: "ws-1",
				disposeRequestedAt: 1_000,
			}),
		).toBe(true);
	});

	it("keeps live sessions with a workspace and no dispose request", () => {
		expect(shouldReapRow({ status: "active", originWorkspaceId: "ws-1" })).toBe(
			false,
		);
		expect(
			shouldReapRow({
				status: "active",
				originWorkspaceId: "ws-1",
				disposeRequestedAt: null,
			}),
		).toBe(false);
	});

	it("still reaps dead-status and workspace-less rows", () => {
		expect(
			shouldReapRow({ status: "disposed", originWorkspaceId: "ws-1" }),
		).toBe(true);
		expect(shouldReapRow({ status: "exited", originWorkspaceId: "ws-1" })).toBe(
			true,
		);
		expect(shouldReapRow({ status: "active", originWorkspaceId: null })).toBe(
			true,
		);
	});
});

describe("planStaleActiveRows", () => {
	const NOW = 1_000_000;
	const OLD = NOW - 120_000;

	function rows(entries: [string, TerminalRowLike][]) {
		return new Map(entries);
	}
	interface TerminalRowLike {
		status: string;
		originWorkspaceId: string | null;
		createdAt?: number;
		disposeRequestedAt?: number | null;
	}

	it("marks active rows the daemon no longer owns", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(["t-alive"]),
			rowsById: rows([
				[
					"t-alive",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
				[
					"t-dead",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-dead"], disposed: [] });
	});

	it("skips rows that are not active", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				["t-1", { status: "exited", originWorkspaceId: "ws", createdAt: OLD }],
				[
					"t-2",
					{ status: "disposed", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: [], disposed: [] });
	});

	it("respects the in-memory live guard against a racy daemon list", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				[
					"t-attached",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: (id) => id === "t-attached",
			now: NOW,
		});
		expect(stale).toEqual({ exited: [], disposed: [] });
	});

	it("leaves freshly created rows alone during the spawn grace window", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				[
					"t-new",
					{ status: "active", originWorkspaceId: "ws", createdAt: NOW - 5_000 },
				],
				[
					"t-old",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-old"], disposed: [] });
	});

	it("marks everything stale when the daemon answers with zero sessions", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				["t-1", { status: "active", originWorkspaceId: "ws", createdAt: OLD }],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-1"], disposed: [] });
	});

	it("preserves dispose intent: daemon-lost rows with a pending dispose become disposed", () => {
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rows([
				[
					"t-disposing",
					{
						status: "active",
						originWorkspaceId: "ws",
						createdAt: OLD,
						disposeRequestedAt: NOW - 30_000,
					},
				],
				[
					"t-crashed",
					{ status: "active", originWorkspaceId: "ws", createdAt: OLD },
				],
			]),
			isLive: () => false,
			now: NOW,
		});
		expect(stale).toEqual({ exited: ["t-crashed"], disposed: ["t-disposing"] });
	});
});

describe("markStaleActiveRows agent bindings", () => {
	const OLD = Date.now() - 10 * 60_000;

	function createTestDb(): HostDb {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		// bun:sqlite's drizzle type differs from the better-sqlite3-based
		// HostDb; the query surface used here is identical (same cast as
		// terminal-agents/persistence.test.ts).
		return db as unknown as HostDb;
	}

	function seed(
		db: HostDb,
		row: {
			id: string;
			status?: string;
			workspaceId?: string | null;
			createdAt?: number;
			disposeRequestedAt?: number | null;
			binding?: {
				agentSessionId?: string | null;
				lastEventType?: string;
				endedAt?: number | null;
				endReason?: string | null;
			} | null;
		},
	) {
		db.insert(terminalSessions)
			.values({
				id: row.id,
				status: row.status ?? "active",
				originWorkspaceId: row.workspaceId ?? "ws-1",
				createdAt: row.createdAt ?? OLD,
				disposeRequestedAt: row.disposeRequestedAt ?? null,
			})
			.run();
		if (row.binding === null) return;
		const binding = row.binding ?? {};
		db.insert(terminalAgentBindings)
			.values({
				terminalId: row.id,
				workspaceId: row.workspaceId ?? "ws-1",
				agentId: "claude",
				// An explicit null asks for a binding that never captured a
				// session id; omitting it takes the default.
				agentSessionId:
					binding.agentSessionId === undefined
						? "sess-1"
						: binding.agentSessionId,
				startedAt: OLD,
				lastEventAt: OLD,
				lastEventType: binding.lastEventType ?? "Stop",
				endedAt: binding.endedAt ?? null,
				endReason: binding.endReason ?? null,
			})
			.run();
	}

	/**
	 * The row snapshot the reaper passes in, loaded the way its own
	 * `loadTerminalRowsById` does. Tests that exercise the policy must supply
	 * it: with a non-empty `liveSessions` the sweep trusts the caller's map
	 * and never reloads, so an empty map means the policy sees no rows at all.
	 */
	function snapshotRows(db: HostDb) {
		const rows = db
			.select({
				id: terminalSessions.id,
				status: terminalSessions.status,
				originWorkspaceId: terminalSessions.originWorkspaceId,
				disposeRequestedAt: terminalSessions.disposeRequestedAt,
				createdAt: terminalSessions.createdAt,
			})
			.from(terminalSessions)
			.all();
		return new Map(rows.map((row) => [row.id, row]));
	}

	function requestDispose(db: HostDb, id: string) {
		db.update(terminalSessions)
			.set({ disposeRequestedAt: Date.now() })
			.where(eq(terminalSessions.id, id))
			.run();
	}

	function statusOf(db: HostDb, id: string): string | undefined {
		return db
			.select({ status: terminalSessions.status })
			.from(terminalSessions)
			.where(eq(terminalSessions.id, id))
			.get()?.status;
	}

	function bindingOf(db: HostDb, id: string) {
		return db
			.select({
				agentSessionId: terminalAgentBindings.agentSessionId,
				endedAt: terminalAgentBindings.endedAt,
				endReason: terminalAgentBindings.endReason,
			})
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, id))
			.get();
	}

	it("leaves a daemon-lost agent session resumable", () => {
		const db = createTestDb();
		seed(db, { id: "t-lost" });

		markStaleActiveRows(db, [], new Map());

		expect(statusOf(db, "t-lost")).toBe("exited");
		expect(bindingOf(db, "t-lost")?.endReason).toBe("terminal-exited");
		expect(
			findResumeCandidateBinding(db, "ws-1", "t-lost")?.agentSessionId,
		).toBe("sess-1");
	});

	it("keeps a dispose-stamped row's agent out of the resume candidates", () => {
		const db = createTestDb();
		seed(db, { id: "t-killed", disposeRequestedAt: OLD });

		markStaleActiveRows(db, [], new Map());

		expect(statusOf(db, "t-killed")).toBe("disposed");
		expect(findResumeCandidateBinding(db, "ws-1", "t-killed")).toBeUndefined();
	});

	it("leaves bindings of rows it does not sweep untouched", () => {
		const db = createTestDb();
		seed(db, { id: "t-alive" });
		seed(db, { id: "t-fresh", createdAt: Date.now() });
		seed(db, { id: "t-stale" });

		// t-alive is still in the daemon's list and t-fresh is inside the
		// spawn grace window; only t-stale is condemned. Its sweep is what
		// proves the policy actually evaluated these rows.
		expect(markStaleActiveRows(db, [{ id: "t-alive" }], snapshotRows(db))).toBe(
			1,
		);

		expect(statusOf(db, "t-stale")).toBe("exited");
		expect(statusOf(db, "t-alive")).toBe("active");
		expect(bindingOf(db, "t-alive")?.endedAt).toBeNull();
		expect(statusOf(db, "t-fresh")).toBe("active");
		expect(bindingOf(db, "t-fresh")?.endedAt).toBeNull();
	});

	it("rolls the row back when the binding write fails, and retries later", () => {
		const db = createTestDb();
		seed(db, { id: "t-lost" });
		// A binding write that fails for any reason (locked db, constraint,
		// corrupt row). Committing the status flip without the binding stamp
		// is unrecoverable: the row leaves `active`, so no later sweep, attach
		// or respawn ever ends the binding again. The sweep fails as a whole
		// instead (the reap pass logs it) and nothing is committed.
		db.run(
			sql`CREATE TRIGGER fail_binding_write BEFORE UPDATE ON terminal_agent_bindings BEGIN SELECT RAISE(ABORT, 'binding write failed'); END`,
		);

		expect(() => markStaleActiveRows(db, [], new Map())).toThrow(
			/binding write failed/,
		);

		// Nothing committed, so the row is still a candidate for the sweep.
		expect(statusOf(db, "t-lost")).toBe("active");
		expect(bindingOf(db, "t-lost")?.endedAt).toBeNull();

		db.run(sql`DROP TRIGGER fail_binding_write`);
		expect(markStaleActiveRows(db, [], new Map())).toBe(1);

		expect(statusOf(db, "t-lost")).toBe("exited");
		expect(
			findResumeCandidateBinding(db, "ws-1", "t-lost")?.agentSessionId,
		).toBe("sess-1");
	});

	it("stops offering resume when a dispose lands after the exit flip", () => {
		const db = createTestDb();
		seed(db, { id: "t-swept" });

		expect(markStaleActiveRows(db, [], new Map())).toBe(1);
		expect(findResumeCandidateBinding(db, "ws-1", "t-swept")).toBeDefined();

		// The user closes the pane a moment later. The dispose route stamps
		// the binding first, then `disposeSessionAndWait` stamps the durable
		// intent and flips the row — and none of it may leave the pane
		// auto-resuming the session they just ended.
		markTerminalAgentBindingEnded(db, "t-swept", "disposed");
		requestDispose(db, "t-swept");
		db.update(terminalSessions)
			.set({ status: "disposed", endedAt: Date.now() })
			.where(eq(terminalSessions.id, "t-swept"))
			.run();

		expect(bindingOf(db, "t-swept")?.endReason).toBe("disposed");
		expect(findResumeCandidateBinding(db, "ws-1", "t-swept")).toBeUndefined();
		expect(claimResumeCandidateBinding(db, "ws-1", "t-swept")).toBeUndefined();
	});

	it("keeps a binding the dispose route already stamped out of resume", () => {
		// The reverse interleaving: the dispose route stamped the binding
		// disposed and its kill has not flipped the row yet, so the sweep
		// still sees an `active` row with no intent stamp. "disposed" is
		// sticky — the sweep's terminal-death stamp must not overwrite it.
		const db = createTestDb();
		seed(db, {
			id: "t-pane-closed",
			binding: { endedAt: OLD, endReason: "disposed" },
		});

		expect(markStaleActiveRows(db, [], new Map())).toBe(1);

		expect(statusOf(db, "t-pane-closed")).toBe("exited");
		expect(bindingOf(db, "t-pane-closed")?.endReason).toBe("disposed");
		expect(
			findResumeCandidateBinding(db, "ws-1", "t-pane-closed"),
		).toBeUndefined();
	});

	it("still sweeps a stale row that never had an agent binding", () => {
		const db = createTestDb();
		seed(db, { id: "t-no-agent", binding: null });

		expect(markStaleActiveRows(db, [], new Map())).toBe(1);

		expect(statusOf(db, "t-no-agent")).toBe("exited");
		expect(bindingOf(db, "t-no-agent")).toBeUndefined();
	});

	it("sweeps a stale row whose binding never captured a session id", () => {
		// Such a binding can never be a resume candidate, but the row still has
		// to leave `active` — that is what stops live-session reads from
		// offering an agent whose pty is gone.
		const db = createTestDb();
		seed(db, { id: "t-idless", binding: { agentSessionId: null } });

		expect(markStaleActiveRows(db, [], new Map())).toBe(1);

		expect(statusOf(db, "t-idless")).toBe("exited");
		expect(bindingOf(db, "t-idless")?.endReason).toBe("terminal-exited");
		expect(findResumeCandidateBinding(db, "ws-1", "t-idless")).toBeUndefined();
	});

	it("does not overwrite an older clean detach", () => {
		const db = createTestDb();
		seed(db, {
			id: "t-detached",
			binding: { endedAt: OLD, endReason: "detached" },
		});

		markStaleActiveRows(db, [], new Map());

		expect(statusOf(db, "t-detached")).toBe("exited");
		expect(bindingOf(db, "t-detached")?.endReason).toBe("detached");
		expect(
			findResumeCandidateBinding(db, "ws-1", "t-detached"),
		).toBeUndefined();
	});
});

describe("planArchivedSuspends", () => {
	const NOW = 1_000_000_000;
	const PAST_GRACE = NOW - ARCHIVE_SUSPEND_GRACE_MS - 1;
	const activeRow = { status: "active", originWorkspaceId: "ws-1" };

	it("suspends a live session once its workspace has been archived past the grace", () => {
		const plan = planArchivedSuspends({
			liveSessions: [{ id: "term-1" }],
			rowById: new Map([["term-1", activeRow]]),
			archivedWorkspaces: new Map([["ws-1", PAST_GRACE]]),
			now: NOW,
		});
		expect(plan.suspend).toEqual(["term-1"]);
	});

	it("leaves sessions alone inside the grace window (the undo toast must get the same pty back)", () => {
		const plan = planArchivedSuspends({
			liveSessions: [{ id: "term-1" }],
			rowById: new Map([["term-1", activeRow]]),
			archivedWorkspaces: new Map([
				["ws-1", NOW - ARCHIVE_SUSPEND_GRACE_MS + 1],
			]),
			now: NOW,
		});
		expect(plan.suspend).toEqual([]);
	});

	it("never suspends a session whose workspace is not archived", () => {
		const plan = planArchivedSuspends({
			liveSessions: [{ id: "term-1" }, { id: "term-2" }],
			rowById: new Map([
				["term-1", activeRow],
				["term-2", { status: "active", originWorkspaceId: "ws-2" }],
			]),
			archivedWorkspaces: new Map([["ws-2", PAST_GRACE]]),
			now: NOW,
		});
		expect(plan.suspend).toEqual(["term-2"]);
	});

	it("lets dispose supersede suspend for a row the orphan pass already condemns", () => {
		const plan = planArchivedSuspends({
			liveSessions: [{ id: "term-1" }],
			rowById: new Map([
				["term-1", { ...activeRow, disposeRequestedAt: NOW - 1 }],
			]),
			archivedWorkspaces: new Map([["ws-1", PAST_GRACE]]),
			now: NOW,
		});
		expect(plan.suspend).toEqual([]);
	});

	it("is idempotent: an already-suspended session is no longer alive, so it is never planned again", () => {
		const plan = planArchivedSuspends({
			liveSessions: [],
			rowById: new Map([
				["term-1", { status: "suspended", originWorkspaceId: "ws-1" }],
			]),
			archivedWorkspaces: new Map([["ws-1", PAST_GRACE]]),
			now: NOW,
		});
		expect(plan.suspend).toEqual([]);
	});

	it("never suspends a session created after the archive (deliberate new use)", () => {
		// A CLI or automation opened this terminal in the archived workspace;
		// creation also unarchives, but even racing that, an older archive must
		// not reap a shell someone just started.
		const plan = planArchivedSuspends({
			liveSessions: [{ id: "old" }, { id: "new" }],
			rowById: new Map([
				["old", { ...activeRow, createdAt: PAST_GRACE - 10_000 }],
				["new", { ...activeRow, createdAt: PAST_GRACE + 10_000 }],
			]),
			archivedWorkspaces: new Map([["ws-1", PAST_GRACE]]),
			now: NOW,
		});
		expect(plan.suspend).toEqual(["old"]);
	});

	it("skips rowless, workspace-less, and non-active rows", () => {
		const plan = planArchivedSuspends({
			liveSessions: [
				{ id: "rowless" },
				{ id: "no-workspace" },
				{ id: "exited" },
			],
			rowById: new Map([
				["no-workspace", { status: "active", originWorkspaceId: null }],
				["exited", { status: "exited", originWorkspaceId: "ws-1" }],
			]),
			archivedWorkspaces: new Map([["ws-1", PAST_GRACE]]),
			now: NOW,
		});
		expect(plan.suspend).toEqual([]);
	});
});

describe("loadArchivedWorkspaces", () => {
	it("lists user-archived rows only: tombstones belong to destroy, live rows are not archived", () => {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		const base = {
			projectId: null,
			worktreePath: "/tmp/x",
			branch: "b",
			name: "b",
			type: "session" as const,
		};
		db.insert(schema.workspaces)
			.values([
				{ ...base, id: "live", worktreePath: "/tmp/live" },
				{
					...base,
					id: "user",
					worktreePath: "/tmp/user",
					archivedAt: 5,
					archiveReason: "user",
				},
				{
					...base,
					id: "gone",
					worktreePath: "/tmp/gone",
					archivedAt: 6,
					archiveReason: "deleted",
				},
				{
					...base,
					id: "merged",
					worktreePath: "/tmp/merged",
					archivedAt: 7,
					archiveReason: "merged",
				},
			])
			.run();
		expect([...loadArchivedWorkspaces(db as unknown as HostDb)]).toEqual([
			["user", 5],
		]);
	});
});

describe("suspended sessions survive the stale-active sweep", () => {
	const ARCHIVED_AT = Date.now() - 10 * 60_000;
	const CREATED_AT = ARCHIVED_AT - 60_000;

	function createTestDb(): HostDb {
		const sqlite = new Database(":memory:");
		const db = drizzle(sqlite, { schema });
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		return db as unknown as HostDb;
	}

	function seedArchivedWorkspaceWithAgentTerminal(db: HostDb) {
		db.insert(schema.workspaces)
			.values({
				id: "ws-1",
				projectId: null,
				worktreePath: "/tmp/ws-1",
				branch: "feature",
				name: "feature",
				type: "session",
				archivedAt: ARCHIVED_AT,
				archiveReason: "user",
			})
			.run();
		db.insert(terminalSessions)
			.values({
				id: "term-1",
				status: "active",
				originWorkspaceId: "ws-1",
				createdAt: CREATED_AT,
			})
			.run();
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "term-1",
				workspaceId: "ws-1",
				agentId: "claude",
				agentSessionId: "sess-1",
				startedAt: CREATED_AT,
				lastEventAt: CREATED_AT,
				lastEventType: "Stop",
			})
			.run();
	}

	function rowsById(db: HostDb) {
		const rows = db
			.select({
				id: terminalSessions.id,
				status: terminalSessions.status,
				originWorkspaceId: terminalSessions.originWorkspaceId,
				disposeRequestedAt: terminalSessions.disposeRequestedAt,
				createdAt: terminalSessions.createdAt,
			})
			.from(terminalSessions)
			.all();
		return new Map(rows.map((row) => [row.id, row]));
	}

	function sessionRow(db: HostDb) {
		return db
			.select({
				status: terminalSessions.status,
				endedAt: terminalSessions.endedAt,
				disposeRequestedAt: terminalSessions.disposeRequestedAt,
			})
			.from(terminalSessions)
			.where(eq(terminalSessions.id, "term-1"))
			.get();
	}

	it("marks the row suspended and ends (never deletes) the agent binding", () => {
		const db = createTestDb();
		seedArchivedWorkspaceWithAgentTerminal(db);
		const endedAt = Date.now();

		expect(markTerminalSessionSuspended(db, "term-1", endedAt)).toBe(true);

		expect(sessionRow(db)).toEqual({
			status: "suspended",
			endedAt,
			disposeRequestedAt: null,
		});
		const binding = db
			.select({
				agentSessionId: terminalAgentBindings.agentSessionId,
				endedAt: terminalAgentBindings.endedAt,
				endReason: terminalAgentBindings.endReason,
			})
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "term-1"))
			.get();
		expect(binding).toEqual({
			agentSessionId: "sess-1",
			endedAt,
			endReason: "terminal-exited",
		});
	});

	it("only flips active rows: a pty that exited on its own keeps `exited`", () => {
		const db = createTestDb();
		seedArchivedWorkspaceWithAgentTerminal(db);
		db.update(terminalSessions)
			.set({ status: "exited", endedAt: Date.now() })
			.where(eq(terminalSessions.id, "term-1"))
			.run();

		expect(markTerminalSessionSuspended(db, "term-1")).toBe(false);
		expect(sessionRow(db)?.status).toBe("exited");
	});

	it("stays restorable after both grace windows and another full reaper pass", () => {
		const db = createTestDb();
		seedArchivedWorkspaceWithAgentTerminal(db);
		markTerminalSessionSuspended(db, "term-1", Date.now());

		// A later pass: the daemon lists nothing alive (the pty is gone), the
		// clock is past the spawn grace AND the archive grace. The stale-active
		// sweep — the trap that turns a lingering `active` row into an
		// unrestorable `exited` one — must leave a suspended row untouched.
		const later = Date.now() + STALE_ACTIVE_GRACE_MS + ARCHIVE_SUSPEND_GRACE_MS;
		const stale = planStaleActiveRows({
			aliveIds: new Set(),
			rowsById: rowsById(db),
			isLive: noneLive,
			now: later,
		});
		expect(stale).toEqual({ exited: [], disposed: [] });
		expect(markStaleActiveRows(db, [], new Map())).toBe(0);

		const plan = planArchivedSuspends({
			liveSessions: [],
			rowById: rowsById(db),
			archivedWorkspaces: new Map([["ws-1", ARCHIVED_AT]]),
			now: later,
		});
		expect(plan.suspend).toEqual([]);

		expect(sessionRow(db)?.status).toBe("suspended");
		expect(
			findResumeCandidateBinding(db, "ws-1", "term-1")?.agentSessionId,
		).toBe("sess-1");
	});
});
