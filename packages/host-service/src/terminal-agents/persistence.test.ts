import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { terminalAgentBindings, terminalSessions } from "../db/schema";
import {
	claimResumeCandidateBinding,
	findResumeCandidateBinding,
	markTerminalAgentBindingEnded,
	SqliteTerminalAgentBindingPersistence,
	seedEndedTerminalAgentBinding,
	unclaimResumeCandidateBinding,
} from "./persistence";
import { TerminalAgentStore } from "./store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	// bun:sqlite's drizzle type differs from the better-sqlite3-based HostDb,
	// but the query surface used here is identical (same cast as other tests).
	return db as unknown as HostDb;
}

function seedSession(
	db: HostDb,
	{
		id,
		status,
		workspaceId,
		lastEventAt = 2,
	}: {
		id: string;
		status: string;
		workspaceId: string | null;
		lastEventAt?: number;
	},
) {
	db.insert(terminalSessions)
		.values({ id, status, originWorkspaceId: workspaceId, createdAt: 1 })
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId: id,
			workspaceId: workspaceId ?? "ws-1",
			agentId: "claude",
			startedAt: 1,
			lastEventAt,
			lastEventType: "Start",
		})
		.run();
}

describe("SqliteTerminalAgentBindingPersistence live reads", () => {
	it("hides bindings whose session is not active or workspace-less", () => {
		const db = createTestDb();
		// The workspaces FK on originWorkspaceId is nullable and unenforced in
		// bun:sqlite unless PRAGMA foreign_keys is on; seed sessions directly.
		seedSession(db, { id: "t-live", status: "active", workspaceId: "ws-1" });
		seedSession(db, { id: "t-exited", status: "exited", workspaceId: "ws-1" });
		seedSession(db, {
			id: "t-disposed",
			status: "disposed",
			workspaceId: "ws-1",
		});
		seedSession(db, { id: "t-orphan", status: "active", workspaceId: null });

		const persistence = new SqliteTerminalAgentBindingPersistence(db);
		const live = persistence.listLiveByWorkspace("ws-1");
		expect(live.map((binding) => binding.terminalId)).toEqual(["t-live"]);

		expect(persistence.findLiveActive("ws-1", "claude")?.terminalId).toBe(
			"t-live",
		);
	});

	it("routes store reads through the live join, never returning dead terminals", () => {
		const db = createTestDb();
		seedSession(db, {
			id: "t-dead",
			status: "exited",
			workspaceId: "ws-1",
			lastEventAt: 100,
		});
		seedSession(db, {
			id: "t-live",
			status: "active",
			workspaceId: "ws-1",
			lastEventAt: 5,
		});

		const store = new TerminalAgentStore(
			new SqliteTerminalAgentBindingPersistence(db),
		);
		// Hydration loads exited sessions into memory (get() still serves the
		// fresh-launch wait path), but list/find must hide them.
		expect(store.get("t-dead")).toBeDefined();
		expect(
			store.listByWorkspace("ws-1").map((binding) => binding.terminalId),
		).toEqual(["t-live"]);
		// Even though t-dead has the newer lastEventAt, findActive must not
		// route prompts into a dead terminal.
		expect(store.findActive("ws-1", "claude")?.terminalId).toBe("t-live");
	});

	it("findLiveActive prefers the most recently active binding", () => {
		const db = createTestDb();
		seedSession(db, {
			id: "t-old",
			status: "active",
			workspaceId: "ws-1",
			lastEventAt: 10,
		});
		seedSession(db, {
			id: "t-new",
			status: "active",
			workspaceId: "ws-1",
			lastEventAt: 20,
		});

		const persistence = new SqliteTerminalAgentBindingPersistence(db);
		expect(persistence.findLiveActive("ws-1", "claude")?.terminalId).toBe(
			"t-new",
		);
	});

	it("sweepDefunct drops rowless/workspace-less bindings and marks dead-terminal ones ended", () => {
		const db = createTestDb();
		seedSession(db, { id: "t-live", status: "active", workspaceId: "ws-1" });
		seedSession(db, { id: "t-exited", status: "exited", workspaceId: "ws-1" });
		seedSession(db, {
			id: "t-disposed",
			status: "disposed",
			workspaceId: "ws-1",
		});
		seedSession(db, { id: "t-orphan", status: "active", workspaceId: null });
		// Binding with no session row at all (FK unenforced in bun:sqlite).
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "t-missing",
				workspaceId: "ws-1",
				agentId: "claude",
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Start",
			})
			.run();

		new SqliteTerminalAgentBindingPersistence(db).sweepDefunct();

		const remaining = db
			.select({
				terminalId: terminalAgentBindings.terminalId,
				endedAt: terminalAgentBindings.endedAt,
				endReason: terminalAgentBindings.endReason,
			})
			.from(terminalAgentBindings)
			.all();
		expect(remaining.map((row) => row.terminalId).sort()).toEqual([
			"t-disposed",
			"t-exited",
			"t-live",
		]);
		const byId = new Map(remaining.map((row) => [row.terminalId, row]));
		expect(byId.get("t-live")?.endedAt).toBeNull();
		expect(byId.get("t-exited")?.endReason).toBe("terminal-exited");
		expect(byId.get("t-disposed")?.endReason).toBe("terminal-exited");

		// A "detached" mark set before the host went down must survive the sweep.
		const db2 = createTestDb();
		seedSession(db2, { id: "t-quit", status: "exited", workspaceId: "ws-1" });
		markTerminalAgentBindingEnded(db2, "t-quit", "detached", 5);
		new SqliteTerminalAgentBindingPersistence(db2).sweepDefunct();
		const quit = db2
			.select({ endReason: terminalAgentBindings.endReason })
			.from(terminalAgentBindings)
			.all();
		expect(quit).toEqual([{ endReason: "detached" }]);
	});
});

describe("binding end marking and resume candidates", () => {
	function seedWithSessionId(db: HostDb, id: string, status = "active") {
		db.insert(terminalSessions)
			.values({ id, status, originWorkspaceId: "ws-1", createdAt: 1 })
			.run();
		db.insert(terminalAgentBindings)
			.values({
				terminalId: id,
				workspaceId: "ws-1",
				agentId: "claude",
				agentSessionId: `sess-${id}`,
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Start",
			})
			.run();
	}

	it("marks ended and hides the binding from live reads while keeping the row", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		const persistence = new SqliteTerminalAgentBindingPersistence(db);

		const marked = markTerminalAgentBindingEnded(
			db,
			"t1",
			"terminal-exited",
			42,
		);
		expect(marked).toEqual({ workspaceId: "ws-1" });
		expect(persistence.listLiveByWorkspace("ws-1")).toEqual([]);
		expect(persistence.load()).toEqual([]);

		const candidate = findResumeCandidateBinding(db, "ws-1", "t1");
		expect(candidate?.agentSessionId).toBe("sess-t1");
		expect(candidate?.endedAt).toBe(42);
		expect(candidate?.endReason).toBe("terminal-exited");
	});

	it("upgrades a death-gasp detach when the terminal dies moments later", () => {
		// claude runs SessionEnd hooks on SIGHUP, so a daemon kill records a
		// detach ~1s before the terminal death is noticed. That goodbye must
		// not block resume.
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "detached", 10_000);
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 12_000);
		const candidate = findResumeCandidateBinding(db, "ws-1", "t1");
		expect(candidate?.endReason).toBe("terminal-exited");
		expect(candidate?.endedAt).toBe(10_000);
	});

	it("keeps an old detach final when the terminal dies much later", () => {
		// A real user quit: the shell outlived the agent, the terminal died
		// long after. No resume offer.
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "detached", 10_000);
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 50_000);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("never downgrades terminal-exited when a late goodbye trickles in", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 10_000);
		markTerminalAgentBindingEnded(db, "t1", "detached", 11_000);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")?.endReason).toBe(
			"terminal-exited",
		);
	});

	it("does not offer bindings without an agent session id", () => {
		const db = createTestDb();
		seedSession(db, { id: "t1", status: "active", workspaceId: "ws-1" });
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited");
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("offers never-prompted sessions too (the relaunch decides resume vs fresh)", () => {
		const db = createTestDb();
		db.insert(terminalSessions)
			.values({
				id: "t1",
				status: "active",
				originWorkspaceId: "ws-1",
				createdAt: 1,
			})
			.run();
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "t1",
				workspaceId: "ws-1",
				agentId: "claude",
				agentSessionId: "sess-empty",
				startedAt: 1,
				lastEventAt: 2,
				// SessionStart only — the agent never received a prompt. Still a
				// candidate: resumeTerminalAgentSession checks the harness store
				// and launches fresh when there is no conversation to restore.
				lastEventType: "Attached",
			})
			.run();
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited");
		expect(findResumeCandidateBinding(db, "ws-1", "t1")?.lastEventType).toBe(
			"Attached",
		);
	});

	it("getEnded reports end state only for ended rows", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		const persistence = new SqliteTerminalAgentBindingPersistence(db);

		expect(persistence.getEnded("t1")).toBeUndefined();
		expect(persistence.getEnded("nope")).toBeUndefined();

		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 42);
		expect(persistence.getEnded("t1")).toEqual({
			endedAt: 42,
			agentSessionId: "sess-t1",
		});
	});

	it("claim consumes the candidate exactly once", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 42);

		const claimed = claimResumeCandidateBinding(db, "ws-1", "t1");
		expect(claimed?.agentSessionId).toBe("sess-t1");
		expect(claimed?.endReason).toBe("resumed");

		// A second claimer, and the candidate query itself, both lose.
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("claim refuses bindings that are not candidates", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		// Still live — no endedAt.
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();

		markTerminalAgentBindingEnded(db, "t1", "detached", 10_000);
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 50_000);
		// Real quit stays final.
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("unclaim restores a claimed candidate for retry", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 42);
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();

		unclaimResumeCandidateBinding(db, "t1");
		const candidate = findResumeCandidateBinding(db, "ws-1", "t1");
		expect(candidate?.endReason).toBe("terminal-exited");
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});

	it("disposed is sticky: neither death-gasp nor terminal death revives it", () => {
		// A deliberate kill (pane close, CLI kill) marks "disposed" before the
		// SIGHUP goodbye and pty-exit events land — none of them may turn the
		// row back into a resume candidate, or auto-resume resurrects a
		// session the user chose to end at the next pane mount.
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "disposed", 10_000);
		markTerminalAgentBindingEnded(db, "t1", "detached", 10_500);
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 11_000);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("a dispose overrides a terminal-death stamp that beat it", () => {
		// The pane-close route marks the binding disposed before its kill, but
		// the terminal can already be dead: a pty exit or the reaper's sweep
		// stamps "terminal-exited" first. The user's decision still has to
		// win, or auto-resume brings the killed session back.
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 42);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();

		expect(markTerminalAgentBindingEnded(db, "t1", "disposed", 90)).toEqual({
			workspaceId: "ws-1",
		});

		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		expect(claimResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		// Only the reason changes — the first writer's timestamp stands.
		expect(
			new SqliteTerminalAgentBindingPersistence(db).getEnded("t1"),
		).toEqual({ endedAt: 42, agentSessionId: "sess-t1" });
	});

	it("a dispose leaves a resumed claim and a clean detach as they are", () => {
		// Resume cleanup disposes the dead terminal after the claim, and a pane
		// close after a real quit disposes a detached one; neither is a resume
		// candidate, so the override has nothing to protect and the row keeps
		// the reason that tells its history.
		const db = createTestDb();
		const endReasonOf = (id: string) =>
			db
				.select({ endReason: terminalAgentBindings.endReason })
				.from(terminalAgentBindings)
				.where(eq(terminalAgentBindings.terminalId, id))
				.get()?.endReason;
		seedWithSessionId(db, "t-resumed");
		markTerminalAgentBindingEnded(db, "t-resumed", "terminal-exited", 42);
		expect(claimResumeCandidateBinding(db, "ws-1", "t-resumed")).toBeDefined();
		expect(
			markTerminalAgentBindingEnded(db, "t-resumed", "disposed", 90),
		).toBeUndefined();
		expect(endReasonOf("t-resumed")).toBe("resumed");

		seedWithSessionId(db, "t-detached");
		markTerminalAgentBindingEnded(db, "t-detached", "detached", 42);
		expect(
			markTerminalAgentBindingEnded(db, "t-detached", "disposed", 90_000),
		).toBeUndefined();
		expect(endReasonOf("t-detached")).toBe("detached");
	});

	it("a claimed row survives late terminal-death marking untouched", () => {
		// Disposing the dead terminal after a successful resume routes through
		// markTerminalExited — that must not resurrect the candidate.
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 42);
		claimResumeCandidateBinding(db, "ws-1", "t1");

		markTerminalAgentBindingEnded(db, "t1", "terminal-exited", 43);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});

	it("upsert revives an ended row for a fresh agent session", () => {
		const db = createTestDb();
		seedWithSessionId(db, "t1");
		const persistence = new SqliteTerminalAgentBindingPersistence(db);
		markTerminalAgentBindingEnded(db, "t1", "terminal-exited");

		persistence.upsert({
			terminalId: "t1",
			workspaceId: "ws-1",
			agentId: "claude" as never,
			agentSessionId: "sess-new",
			startedAt: 50,
			lastEventAt: 50,
			lastEventType: "Attached",
		});

		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		expect(
			persistence.listLiveByWorkspace("ws-1").map((b) => b.agentSessionId),
		).toEqual(["sess-new"]);
	});
});

describe("seedEndedTerminalAgentBinding (v1 pane migration)", () => {
	function seedBareSession(
		db: HostDb,
		id: string,
		workspaceId: string | null = "ws-1",
	) {
		db.insert(terminalSessions)
			.values({
				id,
				status: "active",
				originWorkspaceId: workspaceId,
				createdAt: 1,
			})
			.run();
	}

	it("seeds a resume candidate for a bindingless terminal", () => {
		const db = createTestDb();
		seedBareSession(db, "t-migrated");

		const result = seedEndedTerminalAgentBinding(db, {
			terminalId: "t-migrated",
			workspaceId: "ws-1",
			agentId: "claude" as never,
			agentSessionId: "sess-v1",
			seededAt: 1_000,
		});

		expect(result).toBe("seeded");
		const candidate = findResumeCandidateBinding(db, "ws-1", "t-migrated");
		expect(candidate?.agentSessionId).toBe("sess-v1");
		expect(candidate?.endReason).toBe("terminal-exited");
		expect(candidate?.lastEventType).toBe("Stop");
		// The seeded row is ended — it must never surface as a live agent.
		const persistence = new SqliteTerminalAgentBindingPersistence(db);
		expect(persistence.listLiveByWorkspace("ws-1")).toEqual([]);
	});

	it("never overwrites a terminal that already earned a binding", () => {
		const db = createTestDb();
		seedBareSession(db, "t1");
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "t1",
				workspaceId: "ws-1",
				agentId: "claude",
				agentSessionId: "sess-real",
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Start",
			})
			.run();

		const result = seedEndedTerminalAgentBinding(db, {
			terminalId: "t1",
			workspaceId: "ws-1",
			agentId: "claude" as never,
			agentSessionId: "sess-v1",
		});

		expect(result).toBe("already-bound");
		expect(
			new SqliteTerminalAgentBindingPersistence(db)
				.listLiveByWorkspace("ws-1")
				.map((b) => b.agentSessionId),
		).toEqual(["sess-real"]);
	});

	it("rejects unknown terminals and workspace mismatches", () => {
		const db = createTestDb();
		seedBareSession(db, "t-other-ws", "ws-2");

		expect(
			seedEndedTerminalAgentBinding(db, {
				terminalId: "t-missing",
				workspaceId: "ws-1",
				agentId: "claude" as never,
				agentSessionId: "sess-v1",
			}),
		).toBe("terminal-not-found");
		expect(
			seedEndedTerminalAgentBinding(db, {
				terminalId: "t-other-ws",
				workspaceId: "ws-1",
				agentId: "claude" as never,
				agentSessionId: "sess-v1",
			}),
		).toBe("terminal-not-found");
	});
});
