import { afterEach, describe, expect, mock, test } from "bun:test";
import { Socket } from "node:net";
import { setV1RuntimeBlockedCheck } from "../v1-runtime-retirement/access";
import type { TerminalHostClient as Client } from "./client";
import type { CreateOrAttachRequest } from "./types";

// Other suites mock the public singleton; exercise the actual client class.
const clientModule = "./client.ts?runtime-block-tests";
const { TerminalHostClient, TerminalHostClientDisposedError } = await import(
	clientModule
);

interface ClientInternals {
	connectAndAuthenticate(): Promise<void>;
	spawnDaemon(): Promise<void>;
	tryConnectControl(): Promise<boolean>;
	sendRequest(type: string, payload: unknown): Promise<unknown>;
	controlSocket: Socket | null;
	streamSocket: Socket | null;
	controlAuthenticated: boolean;
	streamAuthenticated: boolean;
}

const clients: Client[] = [];
afterEach(() => {
	for (const client of clients.splice(0)) client.dispose();
	setV1RuntimeBlockedCheck(() => false);
});

function makeClient() {
	const client = new TerminalHostClient() as Client;
	clients.push(client);
	return { client, internals: client as unknown as ClientInternals };
}

describe("legacy connection retirement races", () => {
	test("a lock during authentication rejects the connection and waiting callers", async () => {
		let blocked = false;
		setV1RuntimeBlockedCheck(() => blocked);
		const { client, internals } = makeClient();
		const gate = Promise.withResolvers<void>();
		const control = new Socket();
		const stream = new Socket();
		internals.connectAndAuthenticate = async () => {
			await gate.promise;
			internals.controlSocket = control;
			internals.streamSocket = stream;
			internals.controlAuthenticated = true;
			internals.streamAuthenticated = true;
		};
		const connected = mock(() => {});
		client.on("connected", connected);
		const first = client.ensureConnected();
		const waiter = client.ensureConnected();
		const outcomes = Promise.allSettled([first, waiter]);
		blocked = true;
		gate.resolve();
		for (const result of await outcomes) {
			expect(result.status).toBe("rejected");
			if (result.status === "rejected")
				expect(result.reason).toBeInstanceOf(TerminalHostClientDisposedError);
		}
		expect(connected).not.toHaveBeenCalled();
		expect(control.destroyed).toBe(true);
		expect(stream.destroyed).toBe(true);
	});

	test("a lock between ensureConnected and request dispatch prevents session creation", async () => {
		let blocked = false;
		setV1RuntimeBlockedCheck(() => blocked);
		const { client, internals } = makeClient();
		const request = mock(async () => ({ pid: null }));
		internals.sendRequest = request;
		client.ensureConnected = async () => {
			blocked = true;
		};
		await expect(
			client.createOrAttach({ sessionId: "race" } as CreateOrAttachRequest),
		).rejects.toBeInstanceOf(TerminalHostClientDisposedError);
		expect(request).not.toHaveBeenCalled();
	});

	test("a lock during the control probe prevents daemon spawning", async () => {
		let blocked = false;
		setV1RuntimeBlockedCheck(() => blocked);
		const { client, internals } = makeClient();
		internals.tryConnectControl = async () => {
			blocked = true;
			return false;
		};
		const spawn = mock(async () => {
			throw new Error("spawn attempted");
		});
		internals.spawnDaemon = spawn;
		await expect(client.ensureConnected()).rejects.toBeInstanceOf(
			TerminalHostClientDisposedError,
		);
		expect(spawn).not.toHaveBeenCalled();
	});
});
