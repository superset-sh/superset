import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
	type ClientMessage,
	CORRELATED_INPUT_ACK_CAPABILITY,
	CURRENT_PROTOCOL_VERSION,
	encodeFrame,
	FrameDecoder,
	type InputMessage,
} from "@superset/pty-daemon/protocol";
import { DaemonClient } from "./DaemonClient.ts";

interface ReceivedInput {
	message: InputMessage;
	payload: Buffer;
}

interface FakeInputDaemon {
	socketPath: string;
	inputs: ReceivedInput[];
	waitForInputs(count: number): Promise<void>;
	close(): Promise<void>;
}

const clients = new Set<DaemonClient>();
const daemons = new Set<FakeInputDaemon>();

afterEach(async () => {
	await Promise.all([...clients].map((client) => client.dispose()));
	clients.clear();
	await Promise.all([...daemons].map((daemon) => daemon.close()));
	daemons.clear();
});

describe("DaemonClient correlated input acknowledgements", () => {
	test("out-of-order ACK and EWRITE settle only their exact input promises", async () => {
		const held: Array<{ socket: net.Socket; input: ReceivedInput }> = [];
		const daemon = await startFakeInputDaemon({
			capabilities: [CORRELATED_INPUT_ACK_CAPABILITY],
			onInput(socket, input) {
				held.push({ socket, input });
				if (held.length !== 2) return;
				const first = held[0]?.input.message;
				const second = held[1]?.input.message;
				if (first?.sequence === undefined || second?.sequence === undefined)
					throw new Error("missing input sequence");
				socket.write(
					encodeFrame({
						type: "input-ack",
						id: second.id,
						sequence: second.sequence,
					}),
				);
				socket.write(
					encodeFrame({
						type: "error",
						id: first.id,
						inputSequence: first.sequence,
						code: "EWRITE",
						message: "pty backlog full",
					}),
				);
			},
		});
		const client = await connectClient(daemon.socketPath);

		const first = client.input("same-session", Buffer.from("first"));
		const second = client.input("same-session", Buffer.from("second"));
		const results = await Promise.allSettled([first, second]);

		expect(results[0]?.status).toBe("rejected");
		if (results[0]?.status === "rejected") {
			expect(String(results[0].reason)).toMatch(/sequence 1 \(EWRITE\)/);
		}
		expect(results[1]).toEqual({ status: "fulfilled", value: undefined });
		expect(daemon.inputs.map(({ payload }) => payload.toString())).toEqual([
			"first",
			"second",
		]);
	});

	test("legacy daemon receives the original frame and normal input does not hang", async () => {
		const daemon = await startFakeInputDaemon();
		const client = await connectClient(daemon.socketPath);

		await expect(
			client.input("legacy-session", Buffer.from("legacy")),
		).resolves.toBeUndefined();
		await daemon.waitForInputs(1);

		expect(daemon.inputs[0]?.message).toEqual({
			type: "input",
			id: "legacy-session",
		});
		expect(daemon.inputs[0]?.payload.toString()).toBe("legacy");
	});

	test("disconnect rejects every still-pending correlated input", async () => {
		const daemon = await startFakeInputDaemon({
			capabilities: [CORRELATED_INPUT_ACK_CAPABILITY],
			onInput(socket) {
				socket.destroy();
			},
		});
		const client = await connectClient(daemon.socketPath);

		await expect(
			client.input("disconnect-session", Buffer.from("pending")),
		).rejects.toThrow(/daemon disconnected/);
	});

	test("mismatched session id rejects instead of resolving another input", async () => {
		const daemon = await startFakeInputDaemon({
			capabilities: [CORRELATED_INPUT_ACK_CAPABILITY],
			onInput(socket, { message }) {
				if (message.sequence === undefined) throw new Error("missing sequence");
				socket.write(
					encodeFrame({
						type: "input-ack",
						id: "different-session",
						sequence: message.sequence,
					}),
				);
			},
		});
		const client = await connectClient(daemon.socketPath);

		await expect(
			client.input("expected-session", Buffer.from("payload")),
		).rejects.toThrow(/named different-session, expected expected-session/);
	});

	test("unknown sequence cannot resolve a pending input", async () => {
		let correctAckSent = false;
		const daemon = await startFakeInputDaemon({
			capabilities: [CORRELATED_INPUT_ACK_CAPABILITY],
			onInput(socket, { message }) {
				if (message.sequence === undefined) throw new Error("missing sequence");
				socket.write(
					encodeFrame({
						type: "input-ack",
						id: message.id,
						sequence: message.sequence + 100,
					}),
				);
				setTimeout(() => {
					correctAckSent = true;
					socket.write(
						encodeFrame({
							type: "input-ack",
							id: message.id,
							sequence: message.sequence,
						}),
					);
				}, 10);
			},
		});
		const client = await connectClient(daemon.socketPath);

		await client.input("sequence-session", Buffer.from("payload"));
		expect(correctAckSent).toBe(true);
	});

	test("missing ACK rejects on a bounded timeout", async () => {
		const daemon = await startFakeInputDaemon({
			capabilities: [CORRELATED_INPUT_ACK_CAPABILITY],
		});
		const client = new DaemonClient({
			socketPath: daemon.socketPath,
			inputAckTimeoutMs: 20,
		});
		clients.add(client);
		await client.connect();

		await expect(
			client.input("timeout-session", Buffer.from("payload")),
		).rejects.toThrow(/timed out after 20ms/);
	});
});

async function connectClient(socketPath: string): Promise<DaemonClient> {
	const client = new DaemonClient({ socketPath });
	clients.add(client);
	await client.connect();
	return client;
}

async function startFakeInputDaemon(
	options: {
		capabilities?: string[];
		onInput?: (socket: net.Socket, input: ReceivedInput) => void;
	} = {},
): Promise<FakeInputDaemon> {
	const socketPath = path.join(
		os.tmpdir(),
		`daemon-input-ack-${process.pid}-${crypto.randomUUID()}.sock`,
	);
	const sockets = new Set<net.Socket>();
	const inputs: ReceivedInput[] = [];
	const inputWaiters: Array<{ count: number; resolve: () => void }> = [];
	const server = net.createServer((socket) => {
		sockets.add(socket);
		socket.on("close", () => sockets.delete(socket));
		const decoder = new FrameDecoder();
		socket.on("data", (chunk) => {
			decoder.push(chunk);
			for (const frame of decoder.drain()) {
				const message = frame.message as ClientMessage;
				if (message.type === "hello") {
					socket.write(
						encodeFrame({
							type: "hello-ack",
							protocol: CURRENT_PROTOCOL_VERSION,
							daemonVersion: "input-ack-test",
							capabilities: options.capabilities,
						}),
					);
					continue;
				}
				if (message.type !== "input") continue;
				const input = {
					message,
					payload: Buffer.from(frame.payload ?? Buffer.alloc(0)),
				};
				inputs.push(input);
				for (let index = inputWaiters.length - 1; index >= 0; index--) {
					const waiter = inputWaiters[index];
					if (waiter && inputs.length >= waiter.count) {
						inputWaiters.splice(index, 1);
						waiter.resolve();
					}
				}
				options.onInput?.(socket, input);
			}
		});
	});
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(socketPath, () => {
			server.off("error", reject);
			resolve();
		});
	});

	let closed = false;
	const daemon: FakeInputDaemon = {
		socketPath,
		inputs,
		waitForInputs(count) {
			if (inputs.length >= count) return Promise.resolve();
			return new Promise<void>((resolve) => {
				inputWaiters.push({ count, resolve });
			});
		},
		async close() {
			if (closed) return;
			closed = true;
			for (const socket of sockets) socket.destroy();
			await new Promise<void>((resolve) => server.close(() => resolve()));
			try {
				fs.unlinkSync(socketPath);
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			}
		},
	};
	daemons.add(daemon);
	return daemon;
}
