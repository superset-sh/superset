import { randomBytes, randomUUID } from "node:crypto";
import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import {
	getMachineAccountSelections,
	setMachineAccountSelection,
} from "../../trpc/router/usage/default-account.ts";
import { AccountEngine } from "../account-engine.ts";
import { createLocalAccountService } from "../account-service.ts";
import { EngineState } from "../engine-state.ts";
import { QuotaStore } from "../quota-store.ts";
import { SessionMover } from "../session-mover.ts";
import { ownerManifestPath, readOwnerManifest } from "./lifecycle.ts";
import { serviceArguments, sessionSnapshots } from "./protocol.ts";
import { AccountRpc } from "./rpc.ts";
import { MachineSessions } from "./sessions.ts";

/** One machine process owns discovery, credential mutations and session moves.
 * Org hosts only register live session snapshots and execute local actions. */
export async function startMachineAccountOwner(
	options: { idleGraceMs?: number } = {},
): Promise<(() => Promise<void>) | null> {
	const state = new EngineState();
	if (state.assertSafeStateDir().readOnly)
		throw new Error("engine-state-unusable");
	const sessions = new MachineSessions();
	const quotaStore = new QuotaStore();
	let engine: AccountEngine;
	const mover = new SessionMover({
		...sessions.hostDeps,
		onNeedsAttention: (event) => engine.reportNeedsAttention(event),
	});
	const changes = new Set<() => void>();
	engine = new AccountEngine({
		engineState: state,
		quotaStore,
		mover,
		hostDeps: sessions.hostDeps,
		machinePointers: {
			read: getMachineAccountSelections,
			write: setMachineAccountSelection,
		},
		broadcast: {
			switched: (payload) => sessions.broadcast("switched", payload),
			engineState: (payload) =>
				payload.needsAttention
					? sessions.attention(payload)
					: sessions.broadcast("engineState", payload),
		},
		subscribeToSessions: (callback) => {
			changes.add(callback);
			return () => {
				changes.delete(callback);
			};
		},
	});
	// Windows disables automatic switching, but still needs one service for
	// manual profiles. There the sidecar renews the otherwise unused lease.
	const windowsNonce = randomUUID();
	engine.start();
	const owns = () =>
		process.platform === "win32"
			? state.claimLock(windowsNonce, Date.now())
			: engine.ownsLock();
	if (!owns()) {
		await engine.stop();
		return null;
	}
	const service = createLocalAccountService(engine, quotaStore);
	const methods = new Set(Object.keys(service));
	const peers = new Set<AccountRpc>();
	const registeredPeers = new Set<AccountRpc>();
	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	const scheduleIdleShutdown = () => {
		if (idleTimer) clearTimeout(idleTimer);
		if (stopped || registeredPeers.size > 0) return;
		idleTimer = setTimeout(() => {
			void close();
		}, options.idleGraceMs ?? 30_000);
	};
	const moves = new Set<Promise<void>>();
	let stopped = false;
	const onChange = () => {
		if (stopped) return;
		for (const change of changes) change();
		const work = mover
			.handleStoreChange("machine")
			.catch((error) =>
				console.warn("[account-owner] session move failed", error),
			);
		moves.add(work);
		void work.finally(() => moves.delete(work));
	};
	sessions.onChange = onChange;
	const token = randomBytes(32).toString("hex");
	let registration = Promise.resolve();
	const server = createServer((socket) => {
		let organizationId: string | null = null;
		const authTimeout = setTimeout(() => socket.destroy(), 3000);
		const rpc = new AccountRpc(socket, async (method, args) => {
			if (stopped) throw new Error("engine-unavailable");
			if (
				method === "register" &&
				organizationId === null &&
				args[0] === token &&
				typeof args[1] === "string" &&
				args[1].length > 0 &&
				args[1].length <= 256
			) {
				clearTimeout(authTimeout);
				const org = args[1];
				const register = registration.then(async () => {
					await sessions.replace(org).catch(() => {});
					if (socket.destroyed || stopped)
						throw new Error("account-client-disconnected");
					organizationId = org;
					sessions.register(org, rpc);
					registeredPeers.add(rpc);
					scheduleIdleShutdown();
				});
				registration = register.catch(() => {});
				await register;
				return true;
			}
			if (!organizationId) throw new Error("unauthorized-account-client");
			if (method === "sessions") {
				sessions.update(organizationId, rpc, sessionSnapshots.parse(args[0]));
				return true;
			}
			if (method.startsWith("service:") && methods.has(method.slice(8))) {
				const invoke = service[method.slice(8) as keyof typeof service] as (
					...values: unknown[]
				) => Promise<unknown>;
				const schema =
					serviceArguments[method.slice(8) as keyof typeof serviceArguments];
				return invoke(...schema.parse(args));
			}
			throw new Error("unknown-account-command");
		});
		peers.add(rpc);
		socket.once("close", () => {
			clearTimeout(authTimeout);
			peers.delete(rpc);
			registeredPeers.delete(rpc);
			if (organizationId) sessions.unregister(organizationId, rpc);
			scheduleIdleShutdown();
		});
	});
	const manifest = ownerManifestPath();
	const temp = `${manifest}.${process.pid}.${randomUUID()}`;
	let heartbeat: ReturnType<typeof setInterval> | undefined;
	const close = async () => {
		if (stopped) return;
		stopped = true;
		if (idleTimer) clearTimeout(idleTimer);
		if (heartbeat) clearInterval(heartbeat);
		if (server.listening) server.close();
		await Promise.allSettled([
			...moves,
			...[...peers].flatMap((peer) => [...peer.active]),
		]);
		await engine.stop();
		if (process.platform === "win32") state.releaseLock(windowsNonce);
		for (const peer of peers) peer.socket.destroy();
		if (readOwnerManifest()?.token === token) unlinkSync(manifest);
	};
	try {
		await new Promise<void>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", resolve);
		});
		const address = server.address();
		if (!address || typeof address === "string")
			throw new Error("account-owner-bind-failed");
		writeFileSync(
			temp,
			JSON.stringify({
				pid: process.pid,
				port: address.port,
				token,
				version: 1,
			}),
			{ mode: 0o600 },
		);
		renameSync(temp, manifest);
		scheduleIdleShutdown();
		heartbeat = setInterval(() => {
			if (!owns()) {
				void close();
				return;
			}
			onChange();
		}, 5000);
		return close;
	} catch (error) {
		try {
			unlinkSync(temp);
		} catch {}
		await close();
		throw error;
	}
}
