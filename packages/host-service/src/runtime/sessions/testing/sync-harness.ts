import {
	type HostEventPacket,
	type SessionEventPacket,
	type SyncServerPacket,
	syncServerPacketSchema,
} from "@superset/host-service-sync/protocol";
import type { SessionUpdate } from "@superset/session-protocol";
import { SessionsSyncHub, type SessionsSyncHubOptions } from "../sync-hub";
import { FakeAcpPort, makeRuntime, T0 } from "./fake-acp-port";

/**
 * A hono/node-ws stand-in that schema-validates every outbound frame, so
 * every test built on it doubles as a wire-conformance test for the server
 * side of the protocol.
 */
export class FakeSyncSocket {
	readyState = 1;
	bufferedAmount = 0;
	closed: { code?: number; reason?: string } | null = null;
	readonly packets: SyncServerPacket[] = [];

	send = (data: string) => {
		this.packets.push(syncServerPacketSchema.parse(JSON.parse(data)));
	};
	close = (code?: number, reason?: string) => {
		this.closed = { code, reason };
		this.readyState = 3;
	};
	get raw() {
		return { bufferedAmount: this.bufferedAmount };
	}

	take(): SyncServerPacket[] {
		return this.packets.splice(0, this.packets.length);
	}
}

/** Hub over a fresh runtime + fake port, with a deterministic clock. */
export function makeHub(options: Partial<SessionsSyncHubOptions> = {}) {
	const port = new FakeAcpPort();
	const runtime = makeRuntime(port);
	let clock = T0 + 900_000;
	const hub = new SessionsSyncHub({
		runtime,
		hostId: "host-test",
		hostIncarnation: "test",
		now: () => {
			clock += 1;
			return clock;
		},
		...options,
	});
	return { port, runtime, hub };
}

export function helloFrame(overrides: Record<string, unknown> = {}) {
	return JSON.stringify({
		type: "hello",
		protocolVersion: 1,
		requestId: "req-hello",
		clientInstanceId: "client-test",
		clientVersion: "0.0.0-test",
		toolResolvers: [],
		...overrides,
	});
}

export async function openClient(hub: SessionsSyncHub) {
	const socket = new FakeSyncSocket();
	const client = hub.connect(socket);
	await client.handleMessage(helloFrame());
	const ack = expectPacket(socket.take()[0], "helloAck");
	return { socket, client, ack };
}

/**
 * Zero cursors: what a client that fetched an empty tRPC snapshot holds.
 * Session logs start at c…0; makeHub pins hostIncarnation "test", so the
 * host stream starts at htest-…0. Subscribing from them replays everything.
 */
export const ZERO_SESSION_CURSOR = "c000000000000";
export const ZERO_HOST_CURSOR = "htest-000000000000";

export function subscribeFrame(input: {
	subscriptionId: string;
	stream: { type: "host" } | { type: "session"; sessionId: string };
	after?: string;
	requestId?: string;
}) {
	return JSON.stringify({
		type: "subscribe",
		requestId: input.requestId ?? `req-${input.subscriptionId}`,
		subscriptionId: input.subscriptionId,
		stream: input.stream,
		after:
			input.after ??
			(input.stream.type === "host" ? ZERO_HOST_CURSOR : ZERO_SESSION_CURSOR),
	});
}

export function unsubscribeFrame(
	subscriptionId: string,
	requestId = "req-unsub",
) {
	return JSON.stringify({ type: "unsubscribe", requestId, subscriptionId });
}

export function expectPacket<T extends SyncServerPacket["type"]>(
	packet: SyncServerPacket | undefined,
	type: T,
): Extract<SyncServerPacket, { type: T }> {
	if (!packet || packet.type !== type) {
		throw new Error(
			`expected a ${type} packet, got ${packet ? packet.type : "nothing"}`,
		);
	}
	return packet as Extract<SyncServerPacket, { type: T }>;
}

export function eventPackets(packets: SyncServerPacket[]) {
	return packets.filter(
		(packet): packet is HostEventPacket | SessionEventPacket =>
			packet.type === "event",
	);
}

export function sessionEvents(
	packets: SyncServerPacket[],
): SessionEventPacket[] {
	return eventPackets(packets).filter(
		(packet): packet is SessionEventPacket => packet.stream === "session",
	);
}

export function hostEvents(packets: SyncServerPacket[]): HostEventPacket[] {
	return eventPackets(packets).filter(
		(packet): packet is HostEventPacket => packet.stream === "host",
	);
}

export function chunk(text: string): SessionUpdate {
	return {
		sessionUpdate: "agent_message_chunk",
		content: { type: "text", text },
	};
}

/** Seed a session and journal a state frame — the shape any real session has. */
export function seedLive(port: FakeAcpPort, sessionId: string) {
	port.seed(sessionId);
	port.emitState(sessionId, {});
}

/** Let markDirty's queueMicrotask coalescing flush run. */
export const flush = () =>
	new Promise<void>((resolve) => setTimeout(resolve, 0));
