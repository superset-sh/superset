import { expect, it } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { AccountEngineHostDeps } from "../host-deps.ts";
import { createMachineAccountClient } from "./client.ts";
import { ownerManifestPath } from "./lifecycle.ts";
import { AccountRpc } from "./rpc.ts";

it("a superseded org client stops reconnecting while its replacement remains usable", async () => {
	const previousHome = process.env.SUPERSET_HOME_DIR;
	const dir = mkdtempSync(join(tmpdir(), "account-client-test-"));
	process.env.SUPERSET_HOME_DIR = dir;
	const peers: AccountRpc[] = [];
	const clients: ReturnType<typeof createMachineAccountClient>[] = [];
	let previous: AccountRpc | undefined;
	let registrations = 0;
	const server = createServer((socket) => {
		const rpc = new AccountRpc(socket, async (method) => {
			if (method === "register") {
				registrations++;
				if (previous) {
					await previous.request("replaced");
					previous.socket.destroy();
				}
				previous = rpc;
			}
			return true;
		});
		peers.push(rpc);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	try {
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("missing port");
		const manifest = ownerManifestPath();
		mkdirSync(dirname(manifest), { recursive: true });
		writeFileSync(
			manifest,
			JSON.stringify({
				pid: process.pid,
				port: address.port,
				token: randomBytes(32).toString("hex"),
				version: 1,
			}),
			{ mode: 0o600 },
		);
		const host: AccountEngineHostDeps = {
			listSessions: () => [],
			isAgentBusy: () => false,
			isTerminalAlive: () => false,
			killAndResume: async () => null,
			sendToTerminal: async () => {},
			snapshotTerminal: async () => null,
			hasStartedAgent: () => false,
			isBracketedPasteActive: () => false,
		};
		const create = () =>
			createMachineAccountClient({
				organizationId: "same-org",
				hostDeps: host,
				broadcast: { switched() {}, engineState() {} },
				subscribe: () => () => {},
			});
		const first = create();
		clients.push(first);
		expect(await first.service.ownsLock()).toBe(true);
		const second = create();
		clients.push(second);
		expect(await second.service.ownsLock()).toBe(true);
		await expect(first.service.ownsLock()).rejects.toThrow(
			"account-client-stopped",
		);
		expect(registrations).toBe(2);
	} finally {
		await Promise.all(clients.map((client) => client.close()));
		for (const peer of peers) peer.socket.destroy();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(dir, { recursive: true, force: true });
	}
});
