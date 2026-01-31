import { rm } from "node:fs/promises";
import { join } from "node:path";
import { SUPERSET_HOME_DIR } from "main/lib/app-environment";
import { appState } from "main/lib/app-state";
import { defaultAppState } from "main/lib/app-state/schemas";
import {
	disposeTerminalHostClient,
	getTerminalHostClient,
} from "main/lib/terminal-host/client";

const TERMINAL_STATE_PATHS = [
	"terminal-history",
	"terminal-host.sock",
	"terminal-host.token",
	"terminal-host.pid",
	"terminal-host.spawn.lock",
	"terminal-host.mtime",
	"daemon.log",
] as const;

export async function resetTerminalStateDev(): Promise<void> {
	console.log("[dev/reset-terminal-state] Resetting terminal state…");

	try {
		const client = getTerminalHostClient();
		await client.shutdownIfRunning({ killSessions: true });
	} catch (error) {
		console.warn(
			"[dev/reset-terminal-state] Failed to shutdown daemon (best-effort):",
			error,
		);
	} finally {
		disposeTerminalHostClient();
	}

	for (const relativePath of TERMINAL_STATE_PATHS) {
		const fullPath = join(SUPERSET_HOME_DIR, relativePath);
		await rm(fullPath, { recursive: true, force: true }).catch((error) => {
			console.warn(
				"[dev/reset-terminal-state] Failed to remove state path:",
				fullPath,
				error,
			);
		});
	}

	// Clear tabs/panes so we don't immediately try to restore a large terminal set.
	appState.data.tabsState = defaultAppState.tabsState;
	try {
		await appState.write();
	} catch (error) {
		console.warn(
			"[dev/reset-terminal-state] Failed to persist app state reset:",
			error,
		);
	}

	console.log("[dev/reset-terminal-state] Done.");
}
