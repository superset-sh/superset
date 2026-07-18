/**
 * Durable behaviors of CanonicalSessionsRuntime: persisted TOP-LEVEL session
 * metadata (title/archive/close overrides — deliberately no messages or
 * events; the vendor transcript is the source of truth, resumed via the
 * native session id) and generation-tagged session cursors (every tracking
 * is a new log generation, so cursors from a dead one reset
 * deterministically). The vanilla storeless semantics stay pinned by
 * canonical-sessions.test.ts.
 */
import { describe, expect, test } from "bun:test";
import { sessionSnapshotSchema } from "@superset/host-service-sync/protocol";
import { CanonicalSessionsRuntime } from "./canonical-sessions";
import type { SessionMetaStore } from "./session-meta-store";
import { FakeAcpPort, T0, WORKSPACE } from "./testing/fake-acp-port";
import { makeMetaStoreDb } from "./testing/sqlite-store";
import { acpMainThreadId } from "./translate-acp";

let bootSerial = 0;

/**
 * Runtime over a shared port + meta store with deterministic clock/id/
 * generation mints. Call again with the same port/store to model the next
 * host process; the boot serial salts generations so two boots never mint
 * the same tag, like the random default.
 */
function bootRuntime(
	port: FakeAcpPort,
	metaStore: SessionMetaStore,
): CanonicalSessionsRuntime {
	bootSerial += 1;
	const boot = bootSerial;
	let clock = T0 + 500_000;
	let generationSerial = 0;
	let mintSerial = 0;
	return new CanonicalSessionsRuntime({
		port,
		metaStore,
		now: () => {
			clock += 1;
			return clock;
		},
		mintSessionId: () => {
			mintSerial += 1;
			return `session-minted-${mintSerial}`;
		},
		mintGeneration: () => {
			generationSerial += 1;
			return `boot${boot}gen${generationSerial}`;
		},
	});
}

describe("CanonicalSessionsRuntime with a session meta store", () => {
	test("title/archive/close overrides survive a host reboot", async () => {
		const port = new FakeAcpPort();
		const { metaStore } = makeMetaStoreDb();
		const first = bootRuntime(port, metaStore);
		port.seed("session-a");
		port.seed("session-b");
		port.seed("session-c");

		await first.updateSession({
			requestId: "req-title-1",
			sessionId: "session-a",
			title: "Renamed A",
		});
		await first.updateSession({
			requestId: "req-archive-1",
			sessionId: "session-b",
			archived: true,
		});
		await first.updateSession({
			requestId: "req-close-1",
			sessionId: "session-c",
			closed: true,
		});
		const archivedAt = (await first.getSession({ sessionId: "session-b" }))
			.session.archivedAt;
		expect(archivedAt).not.toBeNull();

		// Host dies; a fresh runtime over the same DB loads the metadata back.
		first.dispose();
		const second = bootRuntime(port, metaStore);

		const renamed = await second.getSession({ sessionId: "session-a" });
		sessionSnapshotSchema.parse(renamed);
		expect(renamed.session.title).toBe("Renamed A");

		const archived = await second.getSession({ sessionId: "session-b" });
		expect(archived.session.archivedAt).toBe(archivedAt ?? 0);
		// Archived rows stay out of the host snapshot scope after the reboot.
		expect(
			second
				.hostSnapshotData()
				.sessions.some((session) => session.id === "session-b"),
		).toBe(false);

		const closed = await second.getSession({ sessionId: "session-c" });
		expect(closed.session.closedAt).not.toBeNull();
		expect(closed.session.runState).toBe("closed");
		let rejected: unknown = null;
		try {
			await second.submitTurn({
				requestId: "req-send-1",
				sessionId: "session-c",
				threadId: acpMainThreadId("session-c"),
				content: [{ type: "text", text: "hi" }],
			});
		} catch (error) {
			rejected = error;
		}
		expect(String(rejected)).toContain("closed");

		// Un-archiving after the reboot persists too.
		await second.updateSession({
			requestId: "req-unarchive-1",
			sessionId: "session-b",
			archived: false,
		});
		second.dispose();
		const third = bootRuntime(port, metaStore);
		const unarchived = await third.getSession({ sessionId: "session-b" });
		expect(unarchived.session.archivedAt).toBeNull();
	});

	test("createSession titles persist without an explicit update", async () => {
		const port = new FakeAcpPort();
		const { metaStore } = makeMetaStoreDb();
		const first = bootRuntime(port, metaStore);
		const created = await first.createSession({
			requestId: "req-create-1",
			workspaceId: WORKSPACE,
			agentId: "claude-code",
			title: "Fix relay test",
			settings: {
				activeModel: null,
				activeMode: null,
				effort: null,
				configuration: {},
			},
		});
		expect(created.session.title).toBe("Fix relay test");

		first.dispose();
		const second = bootRuntime(port, metaStore);
		const reloaded = await second.getSession({ sessionId: created.session.id });
		expect(reloaded.session.title).toBe("Fix relay test");
	});

	test("a rebooted host mints a new log generation: old session cursors reject deterministically", async () => {
		const port = new FakeAcpPort();
		const { metaStore } = makeMetaStoreDb();
		const first = bootRuntime(port, metaStore);
		port.seed("session-a");

		await first.submitTurn({
			requestId: "req-send-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "hello" }],
		});
		port.completeTurn("session-a", "end_turn");
		const before = await first.getEvents({ sessionId: "session-a" });
		const headBefore = before.head;
		expect(before.items.length).toBeGreaterThan(0);

		// The host process dies; the vendor journal (the fake stands in for the
		// vendor's own transcript store) survives and the log is rebuilt.
		first.dispose();
		const second = bootRuntime(port, metaStore);
		await second.warmSession("session-a");

		// Same payload stream re-derived, but a different generation: every
		// pre-reboot cursor is foreign — reset into the cold path, exactly how
		// host cursors from a dead hub incarnation behave.
		expect(second.sessionReplay("session-a", headBefore)).toEqual({
			ok: false,
			reason: "foreign_cursor",
		});
		let notFound: unknown = null;
		try {
			await second.getEvents({
				sessionId: "session-a",
				beforeCursor: headBefore,
			});
		} catch (error) {
			notFound = error;
		}
		expect(String(notFound)).toContain("Unknown cursor");

		const after = await second.getEvents({ sessionId: "session-a" });
		expect(after.head).not.toBe(headBefore);
		expect(after.items.map((event) => event.payload.type)).toEqual(
			before.items.map((event) => event.payload.type),
		);
		// The rebuild re-derives content from the vendor journal, which never
		// carried request attribution — the documented for-now limitation.
		expect(after.items.every((event) => event.causationId === null)).toBe(true);

		// The zero cursor stays generation-less and always servable.
		const fromZero = second.sessionReplay("session-a", "c000000000000");
		if (!fromZero.ok) throw new Error("zero cursor must stay servable");
		expect(fromZero.events).toEqual(after.items);
	});

	test("sweepOrphanedSessionMeta drops rows for sessions the registry no longer knows", async () => {
		const port = new FakeAcpPort();
		const { metaStore } = makeMetaStoreDb();
		const first = bootRuntime(port, metaStore);
		port.seed("session-kept");
		port.seed("session-doomed");
		await first.updateSession({
			requestId: "req-title-1",
			sessionId: "session-kept",
			title: "Keeper",
		});
		await first.updateSession({
			requestId: "req-title-2",
			sessionId: "session-doomed",
			title: "Doomed",
		});
		expect(
			metaStore
				.loadAll()
				.map((record) => record.sessionId)
				.sort(),
		).toEqual(["session-doomed", "session-kept"]);

		first.dispose();
		port.sessions.delete("session-doomed");
		const second = bootRuntime(port, metaStore);
		second.sweepOrphanedSessionMeta();
		expect(metaStore.loadAll().map((record) => record.sessionId)).toEqual([
			"session-kept",
		]);
		const kept = await second.getSession({ sessionId: "session-kept" });
		expect(kept.session.title).toBe("Keeper");
	});
});
