import * as fs from "node:fs";
import {
	openSpawnSession,
	type SpawnSession,
} from "../fresh-spawn/spawn-session";
import { DEFAULT_SOCKET_PATH, DEFAULT_TOKEN_PATH } from "../fresh-spawn/types";

export interface TrySpawnViaFreshServerOptions {
	socketPath?: string;
	tokenPath?: string;
	env: Record<string, string>;
	/** Connect + handshake timeout. Default 2000ms (fast fallback). */
	handshakeTimeoutMs?: number;
}

/**
 * Attempts to spawn a pty-subprocess via the fresh-spawn server running in
 * Electron main. Returns a SpawnSession (ChildProcess-compatible) on success,
 * or null if the server is unavailable (caller should fall back to direct spawn).
 *
 * Never throws; any failure (non-macOS, socket missing, connect error,
 * handshake timeout) returns null with a console warning so the caller can
 * silently degrade.
 */
export async function trySpawnViaFreshServer(
	options: TrySpawnViaFreshServerOptions,
): Promise<SpawnSession | null> {
	if (process.platform !== "darwin") return null;

	const socketPath = options.socketPath ?? DEFAULT_SOCKET_PATH;
	const tokenPath = options.tokenPath ?? DEFAULT_TOKEN_PATH;

	if (!fs.existsSync(socketPath)) return null;
	if (!fs.existsSync(tokenPath)) return null;

	try {
		return await openSpawnSession({
			socketPath,
			tokenPath,
			env: options.env,
			handshakeTimeoutMs: options.handshakeTimeoutMs ?? 2000,
		});
	} catch (err) {
		console.warn(
			"[fresh-spawn] falling back to direct spawn:",
			err instanceof Error ? err.message : String(err),
		);
		return null;
	}
}
