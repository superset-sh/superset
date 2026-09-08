import { createConnection } from "node:net";
import type { AccountEngineBroadcast } from "../account-engine.ts";
import type { AccountService } from "../account-service.ts";
import type { AccountEngineHostDeps } from "../host-deps.ts";
import type { MovableSession } from "../session-mover.ts";
import { readOwnerManifest, spawnAccountOwner } from "./lifecycle.ts";
import { AccountRpc } from "./rpc.ts";
import { executeSessionCommand, snapshotSessions } from "./sessions.ts";

export function createMachineAccountClient(input: {
	organizationId: string;
	hostDeps: AccountEngineHostDeps;
	broadcast: AccountEngineBroadcast;
	subscribe(onChange: () => void): () => void;
}): { service: AccountService; close(): Promise<void> } {
	let stopped = false;
	let rpc: AccountRpc | null = null;
	let connecting: Promise<AccountRpc> | null = null;
	let lastSpawn = 0;
	const localCommands = new Set<Promise<unknown>>();
	const pendingResumes = new Map<string, MovableSession>();
	const provisional = new Map<
		string,
		{ row: MovableSession; expiresAt: number }
	>();
	const update = async (connection: AccountRpc) => {
		const snapshots = snapshotSessions(input.hostDeps);
		for (const [id, pending] of provisional) {
			if (
				snapshots.some((snapshot) => snapshot.row.terminalId === id) ||
				Date.now() > pending.expiresAt ||
				!input.hostDeps.isTerminalAlive(id)
			) {
				provisional.delete(id);
				continue;
			}
			// A returned PTY is alive before SessionStart creates its binding.
			// Preserve nudge retries but never list it as a move candidate yet.
			snapshots.push({
				row: { ...pending.row, managed: false },
				alive: true,
				busy: true,
				started: false,
				bracketed: false,
			});
		}
		await connection.request("sessions", [snapshots]);
	};
	const connect = async (): Promise<AccountRpc> => {
		if (stopped) throw new Error("account-client-stopped");
		if (rpc && !rpc.socket.destroyed) return rpc;
		if (connecting) return connecting;
		connecting = (async () => {
			const deadline = Date.now() + 15_000;
			while (!stopped && Date.now() < deadline) {
				const manifest = readOwnerManifest();
				if (manifest) {
					const socket = createConnection({
						host: "127.0.0.1",
						port: manifest.port,
					});
					const connection = new AccountRpc(socket, async (method, args) => {
						if (method === "replaced") {
							stopped = true;
							clearInterval(timer);
							unsubscribe();
							await Promise.allSettled(localCommands);
							return;
						}
						if (stopped) throw new Error("account-client-stopped");
						if (method === "switched") {
							input.broadcast.switched(
								args[0] as Parameters<AccountEngineBroadcast["switched"]>[0],
							);
							return;
						}
						if (method === "engineState") {
							input.broadcast.engineState(
								args[0] as Parameters<AccountEngineBroadcast["engineState"]>[0],
							);
							return;
						}
						const work = executeSessionCommand(
							input.hostDeps,
							method,
							args,
							pendingResumes,
						);
						localCommands.add(work);
						try {
							const result = await work;
							if (
								method === "killAndResume" &&
								result &&
								typeof result === "object" &&
								"terminalId" in result &&
								typeof result.terminalId === "string"
							) {
								provisional.set(result.terminalId, {
									row: {
										...(args[0] as MovableSession),
										terminalId: result.terminalId,
									},
									expiresAt: Date.now() + 65_000,
								});
							}
							if (!stopped) await update(connection);
							return result;
						} finally {
							localCommands.delete(work);
						}
					});
					const connectTimer = setTimeout(() => socket.destroy(), 3000);
					socket.once("connect", () => clearTimeout(connectTimer));
					try {
						await connection.request("register", [
							manifest.token,
							input.organizationId,
						]);
						clearTimeout(connectTimer);
						if (stopped) {
							socket.destroy();
							throw new Error("account-client-stopped");
						}
						rpc = connection;
						await update(connection);
						return connection;
					} catch {
						clearTimeout(connectTimer);
						socket.destroy();
					}
				}
				if (Date.now() - lastSpawn > 30_000) {
					lastSpawn = Date.now();
					spawnAccountOwner();
				}
				await new Promise((resolve) => setTimeout(resolve, 200));
			}
			throw new Error("engine-unavailable");
		})().finally(() => {
			connecting = null;
		});
		return connecting;
	};
	const refresh = () => {
		void connect()
			.then(update)
			.catch(() => {});
	};
	const unsubscribe = input.subscribe(refresh);
	const timer = setInterval(refresh, 5000);
	timer.unref?.();
	refresh();
	const service = new Proxy({} as AccountService, {
		get: (_target, method) => {
			// Avoid thenable assimilation of the proxy itself.
			if (method === "then" || typeof method !== "string") return undefined;
			return async (...args: unknown[]) =>
				(await connect()).request(`service:${method}`, args);
		},
	});
	return {
		service,
		close: async () => {
			stopped = true;
			clearInterval(timer);
			unsubscribe();
			// Keep the return channel open while an accepted kill/resume drains;
			// the org's database remains open until close() completes.
			await Promise.allSettled(localCommands);
			rpc?.socket.destroy();
			await connecting?.catch(() => {});
		},
	};
}
