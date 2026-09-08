import { expect, it, mock, spyOn } from "bun:test";
import { randomBytes } from "node:crypto";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { UsageAccount } from "../../trpc/router/usage/types.ts";
import {
	type AccountServicePointers,
	createLocalAccountService,
} from "../account-service.ts";
import type { AccountEngineHostDeps } from "../host-deps.ts";
import type { QuotaStore } from "../quota-store.ts";
import { createMachineAccountClient } from "./client.ts";
import * as lifecycle from "./lifecycle.ts";
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
		mkdirSync(dirname(manifest), { recursive: true, mode: 0o700 });
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

it("uses cached local quota and pointer-only activation for an unsafe state directory without spawning", async () => {
	const previousHome = process.env.SUPERSET_HOME_DIR;
	const dir = mkdtempSync(join(tmpdir(), "account-client-unsafe-"));
	process.env.SUPERSET_HOME_DIR = dir;
	const stateDir = join(dir, "state", "account-engine");
	mkdirSync(stateDir, { recursive: true });
	chmodSync(stateDir, 0o777);
	const spawn = spyOn(lifecycle, "spawnAccountOwner").mockImplementation(
		() => {},
	);
	const manifest = spyOn(lifecycle, "readOwnerManifest");
	const setSelection = mock(() => {});
	const rows = [
		{ agent: "claude", selection: "/usable", status: "token_stale" },
		{ agent: "claude", selection: "/expired", status: "token_expired" },
	] as UsageAccount[];
	const read = mock(async () => rows);
	let refresh = () => {};
	const client = createMachineAccountClient({
		organizationId: "org",
		hostDeps: {} as AccountEngineHostDeps,
		broadcast: { switched() {}, engineState() {} },
		subscribe: (callback) => {
			refresh = callback;
			return () => {};
		},
		localFallback: createLocalAccountService(
			null,
			{ read } as unknown as QuotaStore,
			{ setSelection } as unknown as AccountServicePointers,
		),
	});
	try {
		expect(await client.service.readUsage({ agents: ["claude"] })).toEqual(
			rows,
		);
		expect(read).toHaveBeenCalledWith({ agents: ["claude"] });
		await client.service.switchManually("claude", "/usable");
		expect(setSelection).toHaveBeenCalledTimes(1);
		await expect(
			client.service.switchManually("claude", "/expired"),
		).rejects.toThrow("no-target-login");
		await expect(
			client.service.switchManually("claude", "/unknown"),
		).rejects.toThrow("refresh usage");
		await expect(
			client.service.removeAccount({ agent: "claude", selection: "/usable" }),
		).rejects.toThrow("engine-state-unusable");
		await expect(
			client.service.setSettings("claude", { enabled: true }),
		).rejects.toThrow("engine-state-unusable");
		expect(await client.service.ownsLock()).toBe(false);
		refresh();
		expect(spawn).not.toHaveBeenCalled();
		expect(manifest).not.toHaveBeenCalled();
		expect(setSelection).toHaveBeenCalledTimes(1);
		chmodSync(stateDir, 0o700);
		const local = createLocalAccountService(
			null,
			{ read } as unknown as QuotaStore,
			{ setSelection } as unknown as AccountServicePointers,
		);
		await expect(local.switchManually("claude", "/usable")).rejects.toThrow(
			"engine-unavailable",
		);
		chmodSync(stateDir, 0o777);
		const repaired = createLocalAccountService(
			null,
			{
				read: async () => {
					chmodSync(stateDir, 0o700);
					return rows;
				},
			} as unknown as QuotaStore,
			{ setSelection } as unknown as AccountServicePointers,
		);
		await expect(repaired.switchManually("claude", "/usable")).rejects.toThrow(
			"engine-unavailable",
		);
		expect(setSelection).toHaveBeenCalledTimes(1);
	} finally {
		await client.close();
		spawn.mockRestore();
		manifest.mockRestore();
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(dir, { recursive: true, force: true });
	}
});
