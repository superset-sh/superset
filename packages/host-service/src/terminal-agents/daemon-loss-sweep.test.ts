import { Database } from "bun:sqlite";
import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../db";
import * as schema from "../db/schema";
import { terminalAgentBindings, terminalSessions } from "../db/schema";
import { sweepAgentBindingsAfterDaemonLoss } from "./daemon-loss-sweep";
import { findResumeCandidateBinding } from "./persistence";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../drizzle");

function createTestDb(): HostDb {
	const sqlite = new Database(":memory:");
	const db = drizzle(sqlite, { schema });
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	return db as unknown as HostDb;
}

function seed(db: HostDb, terminalId: string) {
	db.insert(terminalSessions)
		.values({
			id: terminalId,
			status: "active",
			originWorkspaceId: "ws-1",
			createdAt: 1,
		})
		.run();
	db.insert(terminalAgentBindings)
		.values({
			terminalId,
			workspaceId: "ws-1",
			agentId: "claude",
			agentSessionId: `sess-${terminalId}`,
			startedAt: 1,
			lastEventAt: 2,
			lastEventType: "Start",
		})
		.run();
}

describe("sweepAgentBindingsAfterDaemonLoss", () => {
	it("marks only sessions the recovered daemon no longer owns", async () => {
		const db = createTestDb();
		seed(db, "t-lost");
		seed(db, "t-adopted");

		await sweepAgentBindingsAfterDaemonLoss({
			candidates: [
				{ terminalId: "t-lost", db },
				{ terminalId: "t-adopted", db },
			],
			listAliveSessionIds: async () => new Set(["t-adopted"]),
			attempts: 2,
			delayMs: 1,
		});

		expect(findResumeCandidateBinding(db, "ws-1", "t-lost")).toBeDefined();
		expect(findResumeCandidateBinding(db, "ws-1", "t-adopted")).toBeUndefined();
	});

	it("marks everything when no daemon ever answers", async () => {
		const db = createTestDb();
		seed(db, "t1");

		let calls = 0;
		await sweepAgentBindingsAfterDaemonLoss({
			candidates: [{ terminalId: "t1", db }],
			listAliveSessionIds: async () => {
				calls++;
				return null;
			},
			attempts: 3,
			delayMs: 1,
		});

		expect(calls).toBe(3);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeDefined();
	});

	it("skips a binding whose session changed during the sweep delay", async () => {
		// A terminal respawned mid-sweep can start a NEW agent session; the
		// delayed pass must not mark that fresh binding ended.
		const db = createTestDb();
		seed(db, "t1");

		await sweepAgentBindingsAfterDaemonLoss({
			candidates: [{ terminalId: "t1", db }],
			listAliveSessionIds: async () => {
				// Simulate a new agent binding landing while probes run.
				db.update(terminalAgentBindings)
					.set({ agentSessionId: "sess-new-agent" })
					.where(eq(terminalAgentBindings.terminalId, "t1"))
					.run();
				return null;
			},
			attempts: 1,
			delayMs: 1,
		});

		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
		const row = db
			.select({ endedAt: terminalAgentBindings.endedAt })
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "t1"))
			.get();
		expect(row?.endedAt).toBeNull();
	});

	it("never marks a binding that has no captured session id", async () => {
		// Bindings without a session id are never resume candidates, so the
		// sweep must not touch them — including a replacement binding whose
		// session id hasn't been reported yet.
		const db = createTestDb();
		db.insert(terminalSessions)
			.values({
				id: "t-anon",
				status: "active",
				originWorkspaceId: "ws-1",
				createdAt: 1,
			})
			.run();
		db.insert(terminalAgentBindings)
			.values({
				terminalId: "t-anon",
				workspaceId: "ws-1",
				agentId: "vibe",
				startedAt: 1,
				lastEventAt: 2,
				lastEventType: "Start",
			})
			.run();

		await sweepAgentBindingsAfterDaemonLoss({
			candidates: [{ terminalId: "t-anon", db }],
			listAliveSessionIds: async () => null,
			attempts: 1,
			delayMs: 1,
		});

		const row = db
			.select({ endedAt: terminalAgentBindings.endedAt })
			.from(terminalAgentBindings)
			.where(eq(terminalAgentBindings.terminalId, "t-anon"))
			.get();
		expect(row?.endedAt).toBeNull();
	});

	it("stops retrying once a daemon answers and tolerates lister errors", async () => {
		const db = createTestDb();
		seed(db, "t1");

		let calls = 0;
		await sweepAgentBindingsAfterDaemonLoss({
			candidates: [{ terminalId: "t1", db }],
			listAliveSessionIds: async () => {
				calls++;
				if (calls === 1) throw new Error("socket down");
				return new Set(["t1"]);
			},
			attempts: 5,
			delayMs: 1,
		});

		expect(calls).toBe(2);
		expect(findResumeCandidateBinding(db, "ws-1", "t1")).toBeUndefined();
	});
});
