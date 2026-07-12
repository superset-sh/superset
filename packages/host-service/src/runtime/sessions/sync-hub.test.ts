import { describe, expect, test } from "bun:test";
import {
	chunk,
	eventPackets,
	expectPacket,
	FakeSyncSocket,
	flush,
	helloFrame,
	hostEvents,
	makeHub,
	openClient,
	seedLive,
	sessionEvents,
	subscribeFrame,
	unsubscribeFrame,
	ZERO_HOST_CURSOR,
	ZERO_SESSION_CURSOR,
} from "./testing/sync-harness";
import { acpMainThreadId } from "./translate-acp";

describe("SessionsSyncHub", () => {
	test("handshake: hello → helloAck, ping → pong, toolResolversChanged is silent", async () => {
		const { hub } = makeHub({
			limits: { maxSubscriptions: 8, maxFrameBytes: 2_048 },
		});
		const socket = new FakeSyncSocket();
		const client = hub.connect(socket);

		await client.handleMessage(helloFrame({ requestId: "req-h1" }));
		const ack = expectPacket(socket.take()[0], "helloAck");
		expect(ack.requestId).toBe("req-h1");
		expect(ack.protocolVersion).toBe(1);
		expect(ack.hostId).toBe("host-test");
		expect(ack.connectionId.length).toBeGreaterThan(0);
		expect(ack.limits).toEqual({ maxSubscriptions: 8, maxFrameBytes: 2_048 });

		await client.handleMessage(
			JSON.stringify({ type: "ping", nonce: "nonce-1" }),
		);
		expect(expectPacket(socket.take()[0], "pong").nonce).toBe("nonce-1");

		await client.handleMessage(
			JSON.stringify({
				type: "toolResolversChanged",
				requestId: "req-tools",
				toolResolvers: [{ name: "openFile", version: 1 }],
			}),
		);
		expect(socket.take()).toHaveLength(0);
	});

	test("hello with an unsupported protocol version is refused and the socket closes", async () => {
		const { hub } = makeHub();
		const socket = new FakeSyncSocket();
		const client = hub.connect(socket);

		await client.handleMessage(
			helloFrame({ protocolVersion: 2, requestId: "req-v2" }),
		);
		const error = expectPacket(socket.take()[0], "error");
		expect(error.code).toBe("UNSUPPORTED_PROTOCOL_VERSION");
		expect(error.requestId).toBe("req-v2");
		expect(error.retryable).toBe(false);
		expect(socket.closed?.code).toBe(1008);
	});

	test("any packet before hello is rejected and the socket closes", async () => {
		const { hub } = makeHub();
		const socket = new FakeSyncSocket();
		const client = hub.connect(socket);

		await client.handleMessage(
			subscribeFrame({ subscriptionId: "sub-1", stream: { type: "host" } }),
		);
		const error = expectPacket(socket.take()[0], "error");
		expect(error.code).toBe("INVALID_PACKET");
		expect(error.requestId).toBe("req-sub-1");
		expect(socket.closed?.code).toBe(1008);

		// The connection is gone: nothing else is processed.
		await client.handleMessage(helloFrame());
		expect(socket.take()).toHaveLength(0);
	});

	test("a duplicate hello is an error but does not drop the connection", async () => {
		const { hub } = makeHub();
		const { socket, client } = await openClient(hub);

		await client.handleMessage(helloFrame({ requestId: "req-again" }));
		const error = expectPacket(socket.take()[0], "error");
		expect(error.code).toBe("INVALID_PACKET");
		expect(error.requestId).toBe("req-again");
		expect(socket.closed).toBeNull();

		await client.handleMessage(
			JSON.stringify({ type: "ping", nonce: "still-alive" }),
		);
		expect(expectPacket(socket.take()[0], "pong").nonce).toBe("still-alive");
	});

	test("malformed and oversized frames after hello answer INVALID_PACKET and keep the connection", async () => {
		const { hub } = makeHub({ limits: { maxFrameBytes: 512 } });
		const { socket, client } = await openClient(hub);

		await client.handleMessage("this is not json");
		expect(expectPacket(socket.take()[0], "error").code).toBe("INVALID_PACKET");
		expect(socket.closed).toBeNull();

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-big",
				stream: { type: "host" },
				requestId: "r".repeat(600),
			}),
		);
		const oversized = expectPacket(socket.take()[0], "error");
		expect(oversized.code).toBe("INVALID_PACKET");
		expect(oversized.requestId).toBeNull();
		expect(socket.closed).toBeNull();

		await client.handleMessage(
			JSON.stringify({ type: "ping", nonce: "still-alive" }),
		);
		expect(expectPacket(socket.take()[0], "pong").nonce).toBe("still-alive");
	});

	test("session subscribe from the zero cursor: subscribed → full replay → caughtUp, then live events", async () => {
		const { port, runtime, hub } = makeHub();
		seedLive(port, "session-a");
		port.emitUpdate("session-a", chunk("before subscribe"));
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-a",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		const packets = socket.take();
		const subscribed = expectPacket(packets[0], "subscribed");
		expect(subscribed.stream).toBe("session");
		expect(subscribed.sessionId).toBe("session-a");
		expect(subscribed.replay.fromExclusive).toBe(ZERO_SESSION_CURSOR);
		const replayed = sessionEvents(packets);
		expect(replayed.length).toBeGreaterThan(0);
		expect(packets).toHaveLength(replayed.length + 2);
		for (const packet of replayed) {
			expect(packet.sessionId).toBe("session-a");
			expect(packet.cursor <= subscribed.replay.through).toBe(true);
		}
		expect(replayed[replayed.length - 1]?.cursor).toBe(
			subscribed.replay.through,
		);
		const caughtUp = expectPacket(packets[packets.length - 1], "caughtUp");
		expect(caughtUp.through).toBe(subscribed.replay.through);

		// The snapshot rides tRPC now; its head is exactly the replay window's
		// end, so a client that subscribed from the snapshot head misses nothing.
		const snapshot = await runtime.getSession({ sessionId: "session-a" });
		expect(snapshot.head).toBe(subscribed.replay.through);
		expect(
			snapshot.threads.some(
				(thread) => thread.id === acpMainThreadId("session-a"),
			),
		).toBe(true);

		port.emitUpdate("session-a", chunk("live one"));
		const live = eventPackets(socket.take());
		expect(live.length).toBeGreaterThan(0);
		for (const packet of live) {
			expect(packet.stream).toBe("session");
			expect(packet.sessionId).toBe("session-a");
			expect(packet.subscriptionId).toBe("sub-a");
			expect(packet.cursor > subscribed.replay.through).toBe(true);
		}
		// Cursors are strictly increasing on the wire.
		const cursors = live.map((packet) => packet.cursor);
		expect([...cursors].sort()).toEqual(cursors);
		expect(new Set(cursors).size).toBe(cursors.length);
	});

	test("two subscriptions to the same session each get the live feed", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-1",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-2",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();

		port.emitUpdate("session-a", chunk("fan out"));
		const live = eventPackets(socket.take());
		const bySubscription = new Set(live.map((packet) => packet.subscriptionId));
		expect(bySubscription).toEqual(new Set(["sub-1", "sub-2"]));
	});

	test("session subscribe with a cursor replays exactly the events after it", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const witness = await openClient(hub);
		await witness.client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-w",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		witness.socket.take();
		port.emitUpdate("session-a", chunk("one"));
		port.emitUpdate("session-a", chunk("two"));
		const seen = eventPackets(witness.socket.take());
		expect(seen.length).toBeGreaterThan(1);
		const cursors = seen.map((packet) => packet.cursor);
		const resumeFrom = cursors[0];
		if (!resumeFrom) throw new Error("expected a resume cursor");

		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-resume",
				stream: { type: "session", sessionId: "session-a" },
				after: resumeFrom,
			}),
		);
		const packets = socket.take();
		const subscribed = expectPacket(packets[0], "subscribed");
		expect(subscribed.replay.fromExclusive).toBe(resumeFrom);
		const replayed = sessionEvents(packets);
		expect(replayed.map((packet) => packet.cursor)).toEqual(cursors.slice(1));
		expect(replayed.every((packet) => packet.event.id.length > 0)).toBe(true);
		const caughtUp = expectPacket(packets[packets.length - 1], "caughtUp");
		expect(caughtUp.through).toBe(subscribed.replay.through);

		// Resuming from the head replays nothing.
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-at-head",
				stream: { type: "session", sessionId: "session-a" },
				after: caughtUp.through,
			}),
		);
		const atHead = socket.take();
		expect(atHead.map((packet) => packet.type)).toEqual([
			"subscribed",
			"caughtUp",
		]);

		// Both stay live after their replays.
		port.emitUpdate("session-a", chunk("three"));
		const live = eventPackets(socket.take());
		const bySubscription = new Set(live.map((packet) => packet.subscriptionId));
		expect(bySubscription).toEqual(new Set(["sub-resume", "sub-at-head"]));
	});

	test("session subscribe with an unknown cursor answers reset and does not register", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-stale",
				stream: { type: "session", sessionId: "session-a" },
				after: "c999999999999",
			}),
		);
		const reset = expectPacket(socket.take()[0], "reset");
		expect(reset.stream).toBe("session");
		expect(reset.sessionId).toBe("session-a");
		expect(reset.code).toBe("CURSOR_EXPIRED");
		expect(reset.recovery).toBe("refetchSnapshot");

		port.emitUpdate("session-a", chunk("not delivered"));
		expect(eventPackets(socket.take())).toHaveLength(0);

		// The subscriptionId was never registered, so recovery can reuse it.
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-stale",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		const packets = socket.take();
		expect(packets[0]?.type).toBe("subscribed");
		expect(packets[packets.length - 1]?.type).toBe("caughtUp");
		expect(sessionEvents(packets).length).toBe(packets.length - 2);
	});

	test("subscribing to an unknown session answers SESSION_NOT_FOUND", async () => {
		const { hub } = makeHub();
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-ghost",
				stream: { type: "session", sessionId: "session-ghost" },
			}),
		);
		const error = expectPacket(socket.take()[0], "error");
		expect(error.code).toBe("SESSION_NOT_FOUND");
		expect(error.subscriptionId).toBe("sub-ghost");
		expect(error.sessionId).toBe("session-ghost");
		expect(error.retryable).toBe(false);
	});

	test("duplicate subscriptionIds and the subscription limit are refused", async () => {
		const { port, hub } = makeHub({ limits: { maxSubscriptions: 2 } });
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({ subscriptionId: "sub-1", stream: { type: "host" } }),
		);
		socket.take();

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-1",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		const duplicate = expectPacket(socket.take()[0], "error");
		expect(duplicate.code).toBe("INVALID_PACKET");
		expect(duplicate.subscriptionId).toBe("sub-1");

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-2",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-3",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		const limit = expectPacket(socket.take()[0], "error");
		expect(limit.code).toBe("SUBSCRIPTION_LIMIT");
		expect(limit.retryable).toBe(true);

		// Unsubscribing frees a slot.
		await client.handleMessage(unsubscribeFrame("sub-2"));
		expectPacket(socket.take()[0], "unsubscribed");
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-3",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		expect(expectPacket(socket.take()[0], "subscribed").subscriptionId).toBe(
			"sub-3",
		);
	});

	test("unsubscribe confirms with the delivery cursor, stops the feed, and rejects unknown ids", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-a",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();
		port.emitUpdate("session-a", chunk("delivered"));
		const live = eventPackets(socket.take());
		const lastDelivered = live[live.length - 1]?.cursor;
		if (!lastDelivered) throw new Error("expected live events");

		await client.handleMessage(unsubscribeFrame("sub-a", "req-unsub-1"));
		const unsubscribed = expectPacket(socket.take()[0], "unsubscribed");
		expect(unsubscribed.requestId).toBe("req-unsub-1");
		expect(unsubscribed.stream).toBe("session");
		expect(unsubscribed.sessionId).toBe("session-a");
		expect(unsubscribed.through).toBe(lastDelivered);

		port.emitUpdate("session-a", chunk("after unsubscribe"));
		expect(eventPackets(socket.take())).toHaveLength(0);

		// Idempotence is the client's job: a second unsubscribe is an error
		// (`unsubscribed` needs a stream we no longer know).
		await client.handleMessage(unsubscribeFrame("sub-a", "req-unsub-2"));
		const error = expectPacket(socket.take()[0], "error");
		expect(error.code).toBe("INVALID_PACKET");
		expect(error.requestId).toBe("req-unsub-2");
	});

	test("host subscribe from the zero cursor, then coalesced upserts, removals, permissions", async () => {
		const { port, runtime, hub } = makeHub();
		seedLive(port, "session-a");
		seedLive(port, "session-b");
		const { socket, client } = await openClient(hub);

		await client.handleMessage(
			subscribeFrame({ subscriptionId: "sub-host", stream: { type: "host" } }),
		);
		const packets = socket.take();
		expect(packets.map((packet) => packet.type)).toEqual([
			"subscribed",
			"caughtUp",
		]);
		const subscribed = expectPacket(packets[0], "subscribed");
		expect(subscribed.replay.fromExclusive).toBe(ZERO_HOST_CURSOR);
		expect(subscribed.replay.through).toBe(ZERO_HOST_CURSOR);
		// Snapshot content rides tRPC now: both seeded rows are in host scope,
		// and the hub's head is exactly where the subscription started.
		expect(hub.hostHead()).toBe(ZERO_HOST_CURSOR);
		const data = runtime.hostSnapshotData();
		expect(data.sessions.map((session) => session.id).sort()).toEqual([
			"session-a",
			"session-b",
		]);

		// Tracking a session emits its first composed upsert.
		await runtime.warmSession("session-a");
		await flush();
		socket.take();

		// A burst of folds coalesces into one upsert per flush.
		port.emitUpdate("session-a", chunk("one"));
		port.emitUpdate("session-a", chunk("two"));
		await flush();
		const upserts = hostEvents(socket.take()).filter(
			(packet) => packet.event.type === "sessionUpsert",
		);
		expect(upserts).toHaveLength(1);
		const upsert = upserts[0];
		if (!upsert) throw new Error("expected an upsert");
		expect(upsert.stream).toBe("host");
		expect(upsert.sessionId).toBe("session-a");
		expect(upsert.threadId).toBeNull();

		// Permission transitions ride the host stream with their thread.
		await runtime.submitTurn({
			requestId: "req-turn-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "do the thing" }],
		});
		await flush();
		socket.take();
		port.requestPermission("session-a", "perm-1", "toolu_1");
		const available = hostEvents(socket.take()).find(
			(packet) => packet.event.type === "permissionAvailable",
		);
		if (!available || available.event.type !== "permissionAvailable") {
			throw new Error("expected a permissionAvailable host event");
		}
		expect(available.sessionId).toBe("session-a");
		expect(available.threadId).toBe(available.event.permission.threadId);
		const permissionId = available.event.permission.id;

		port.respondToPermission({
			sessionId: "session-a",
			requestId: "perm-1",
			outcome: { outcome: "selected", optionId: "allow" },
		});
		const resolved = hostEvents(socket.take()).find(
			(packet) => packet.event.type === "permissionResolved",
		);
		if (!resolved || resolved.event.type !== "permissionResolved") {
			throw new Error("expected a permissionResolved host event");
		}
		expect(resolved.event.permissionId).toBe(permissionId);
		expect(resolved.threadId).toBeNull();

		// Archiving removes the session from the host scope.
		await runtime.updateSession({
			requestId: "req-archive",
			sessionId: "session-a",
			archived: true,
		});
		const removed = hostEvents(socket.take()).find(
			(packet) => packet.event.type === "sessionRemoved",
		);
		if (!removed || removed.event.type !== "sessionRemoved") {
			throw new Error("expected a sessionRemoved host event");
		}
		expect(removed.sessionId).toBe("session-a");
		expect(removed.event.reason).toBe("archived");
	});

	test("host subscribe with a cursor replays the retained tail; bad cursors reset", async () => {
		const { port, runtime, hub } = makeHub();
		seedLive(port, "session-a");
		const witness = await openClient(hub);
		await witness.client.handleMessage(
			subscribeFrame({ subscriptionId: "sub-w", stream: { type: "host" } }),
		);
		witness.socket.take();

		await runtime.warmSession("session-a");
		await flush();
		port.emitUpdate("session-a", chunk("more"));
		await flush();
		await runtime.submitTurn({
			requestId: "req-turn-1",
			sessionId: "session-a",
			threadId: acpMainThreadId("session-a"),
			content: [{ type: "text", text: "go" }],
		});
		port.requestPermission("session-a", "perm-1", "toolu_1");
		await flush();
		const seen = eventPackets(witness.socket.take());
		expect(seen.length).toBeGreaterThan(1);
		const cursors = seen.map((packet) => packet.cursor);
		const resumeFrom = cursors[0];
		if (!resumeFrom) throw new Error("expected host cursors");

		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-resume",
				stream: { type: "host" },
				after: resumeFrom,
			}),
		);
		const packets = socket.take();
		const subscribed = expectPacket(packets[0], "subscribed");
		expect(subscribed.replay.fromExclusive).toBe(resumeFrom);
		expect(eventPackets(packets).map((packet) => packet.cursor)).toEqual(
			cursors.slice(1),
		);
		const caughtUp = expectPacket(packets[packets.length - 1], "caughtUp");
		expect(caughtUp.through).toBe(cursors[cursors.length - 1] ?? "");

		// At the head: subscribed + caughtUp only.
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-at-head",
				stream: { type: "host" },
				after: caughtUp.through,
			}),
		);
		expect(socket.take().map((packet) => packet.type)).toEqual([
			"subscribed",
			"caughtUp",
		]);

		// A cursor from the future, another format, or another hub incarnation
		// is invalid — never silently accepted into this hub's serial range.
		for (const after of [
			"htest-999999999999",
			"not-a-cursor",
			"hother-000000000001",
			"h000000000001",
		]) {
			await client.handleMessage(
				subscribeFrame({
					subscriptionId: `sub-bad-${after}`,
					stream: { type: "host" },
					after,
				}),
			);
			const reset = expectPacket(socket.take()[0], "reset");
			expect(reset.stream).toBe("host");
			expect(reset.code).toBe("CURSOR_INVALID");
			expect(reset.recovery).toBe("refetchSnapshot");
		}
	});

	test("a host cursor older than the retained ring answers CURSOR_EXPIRED", async () => {
		const { port, runtime, hub } = makeHub({ limits: { hostRingLimit: 1 } });
		seedLive(port, "session-a");
		await runtime.warmSession("session-a");
		await flush();
		port.emitUpdate("session-a", chunk("more"));
		await flush();

		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-expired",
				stream: { type: "host" },
				after: "htest-000000000000",
			}),
		);
		const reset = expectPacket(socket.take()[0], "reset");
		expect(reset.code).toBe("CURSOR_EXPIRED");
		expect(reset.recovery).toBe("refetchSnapshot");
	});

	test("a client that stops draining is dropped with a back-pressure close", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-a",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();

		socket.bufferedAmount = 9 * 1024 * 1024;
		port.emitUpdate("session-a", chunk("undeliverable"));
		expect(socket.closed?.code).toBe(1013);
		expect(eventPackets(socket.take())).toHaveLength(0);

		// The connection is fully detached: recovering the buffer changes nothing.
		socket.bufferedAmount = 0;
		port.emitUpdate("session-a", chunk("still gone"));
		expect(socket.take()).toHaveLength(0);
	});

	test("hub dispose closes connections and detaches from the runtime feeds", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-a",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();

		hub.dispose();
		expect(socket.closed?.code).toBe(1001);
		port.emitUpdate("session-a", chunk("after dispose"));
		await flush();
		expect(socket.take()).toHaveLength(0);

		// Frames arriving after dispose are ignored outright.
		await client.handleMessage(
			JSON.stringify({ type: "ping", nonce: "too-late" }),
		);
		expect(socket.take()).toHaveLength(0);
	});

	test("a host cursor from a previous hub incarnation resets CURSOR_INVALID even when the serial range overlaps", async () => {
		// Hub A (harness incarnation "test") hands a client a host cursor.
		const first = makeHub();
		seedLive(first.port, "session-a");
		const witness = await openClient(first.hub);
		await witness.client.handleMessage(
			subscribeFrame({ subscriptionId: "sub-w", stream: { type: "host" } }),
		);
		witness.socket.take();
		await first.runtime.warmSession("session-a");
		await flush();
		first.port.emitUpdate("session-a", chunk("a1"));
		await flush();
		const staleCursor = eventPackets(witness.socket.take())[0]?.cursor;
		if (!staleCursor) throw new Error("expected a hub-A host cursor");
		first.hub.dispose();

		// The host restarts: a new hub with a new incarnation advances its
		// serial PAST the stale cursor's number — the numeric overlap that
		// would be silently accepted if cursors carried no incarnation.
		const second = makeHub({ hostIncarnation: "resurrect" });
		seedLive(second.port, "session-b");
		await second.runtime.warmSession("session-b");
		await flush();
		second.port.emitUpdate("session-b", chunk("b1"));
		await flush();
		second.port.emitUpdate("session-b", chunk("b2"));
		await flush();

		const { socket, client } = await openClient(second.hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-stale",
				stream: { type: "host" },
				after: staleCursor,
			}),
		);
		const reset = expectPacket(socket.take()[0], "reset");
		expect(reset.stream).toBe("host");
		expect(reset.code).toBe("CURSOR_INVALID");
		expect(reset.recovery).toBe("refetchSnapshot");

		// The prescribed recovery works: re-fetch the tRPC snapshot and
		// resubscribe from the head it was taken at.
		expect(
			second.runtime.hostSnapshotData().sessions.map((session) => session.id),
		).toEqual(["session-b"]);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-fresh",
				stream: { type: "host" },
				after: second.hub.hostHead(),
			}),
		);
		expect(socket.take().map((packet) => packet.type)).toEqual([
			"subscribed",
			"caughtUp",
		]);
		second.hub.dispose();
	});

	test("a synchronous socket.send throw drops the connection instead of wedging it", async () => {
		const { port, hub } = makeHub();
		seedLive(port, "session-a");
		const { socket, client } = await openClient(hub);
		await client.handleMessage(
			subscribeFrame({
				subscriptionId: "sub-a",
				stream: { type: "session", sessionId: "session-a" },
			}),
		);
		socket.take();

		// The next live fan-out hits a socket whose send throws synchronously
		// (torn TCP connection surfacing through ws). The throw must not
		// escape into the runtime's listener loop, and the connection must not
		// stay registered as if delivery had succeeded.
		const realSend = socket.send;
		socket.send = () => {
			throw new Error("EPIPE");
		};
		port.emitUpdate("session-a", chunk("undeliverable"));
		expect(socket.closed?.code).toBe(1011);

		// Fully detached: a healthy socket again changes nothing.
		socket.send = realSend;
		port.emitUpdate("session-a", chunk("still gone"));
		expect(socket.take()).toHaveLength(0);
	});

	test("connect after dispose refuses the socket outright", async () => {
		const { hub } = makeHub();
		hub.dispose();
		// Double dispose stays a no-op.
		hub.dispose();

		const socket = new FakeSyncSocket();
		const client = hub.connect(socket);
		expect(socket.closed?.code).toBe(1001);
		await client.handleMessage(helloFrame());
		expect(socket.take()).toHaveLength(0);
	});
});
