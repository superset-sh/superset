import { type SpawnServer, startSpawnServer } from "./spawn-server";
import { DEFAULT_SOCKET_PATH, DEFAULT_TOKEN_PATH } from "./types";

let instance: SpawnServer | null = null;

/**
 * Start the fresh-spawn server. Should be called once from app.whenReady().
 * No-op on non-macOS platforms (the stale-context bug is macOS-specific).
 *
 * The caller must supply `subprocessScriptPath` — the absolute path of the
 * built `pty-subprocess.js` to spawn when a client requests a new PTY.
 * Path resolution is the caller's responsibility because it depends on
 * bundling topology (rollup output directory, asar layout, dev vs packaged)
 * which only the main entry point knows with certainty.
 *
 * Idempotent: a duplicate call while the server is already running logs a
 * warning and returns without starting a second instance.
 *
 * Never throws: any startup error is logged and swallowed so the rest of
 * the app lifecycle can continue. Callers degrade via
 * `trySpawnViaFreshServer`, which falls back to direct spawn when the
 * socket is missing.
 */
export async function startFreshSpawnServer(options: {
	subprocessScriptPath: string;
}): Promise<void> {
	if (process.platform !== "darwin") {
		console.info("[fresh-spawn] non-darwin platform, server not started");
		return;
	}

	if (instance) {
		console.warn("[fresh-spawn] server already started, ignoring");
		return;
	}

	try {
		instance = await startSpawnServer({
			socketPath: DEFAULT_SOCKET_PATH,
			tokenPath: DEFAULT_TOKEN_PATH,
			subprocessScriptPath: options.subprocessScriptPath,
		});
		console.info(
			`[fresh-spawn] server listening on ${DEFAULT_SOCKET_PATH} (spawning ${options.subprocessScriptPath})`,
		);
	} catch (err) {
		console.error(
			`[fresh-spawn] failed to start server: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/**
 * Gracefully close the fresh-spawn server. Called from before-quit.
 * Never throws; errors are logged and the instance reference is cleared
 * so a subsequent start call will succeed.
 */
export async function stopFreshSpawnServer(): Promise<void> {
	if (!instance) return;
	try {
		await instance.close();
		console.info("[fresh-spawn] server stopped");
	} catch (err) {
		console.error(
			`[fresh-spawn] error stopping server: ${err instanceof Error ? err.message : String(err)}`,
		);
	} finally {
		instance = null;
	}
}

/**
 * Exposed for tests. Returns the current server instance or null.
 */
export function getFreshSpawnServerInstance(): SpawnServer | null {
	return instance;
}
