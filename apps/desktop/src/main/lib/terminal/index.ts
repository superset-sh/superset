import { getTerminalHostClient } from "main/lib/terminal-host/client";
import { getTerminalDaemonRegistry } from "main/lib/terminal-host/daemon-registry";
import {
	getCurrentTerminalGenerationId,
	markGenerationRetired,
} from "main/lib/terminal-host/daemon-rollout";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import { DaemonTerminalManager, getDaemonTerminalManager } from "./daemon";
import { prewarmTerminalEnv } from "./env";

export { DaemonTerminalManager, getDaemonTerminalManager };
export type {
	CreateSessionParams,
	SessionResult,
	TerminalDataEvent,
	TerminalEvent,
	TerminalExitEvent,
} from "./types";

const DEBUG_TERMINAL = process.env.SUPERSET_TERMINAL_DEBUG === "1";
let prewarmInFlight: Promise<void> | null = null;
let rolloutReconcileTimer: NodeJS.Timeout | null = null;

const ROLLOUT_RECONCILE_INTERVAL_MS = 15_000;
const MAX_DRAIN_AGE_MS = 24 * 60 * 60 * 1000;

async function ensurePreferredDaemonGeneration(): Promise<void> {
	const client = getTerminalHostClient();
	await client.ensureConnected();
}

async function reconcileDrainingGenerations(): Promise<void> {
	const client = getTerminalHostClient();
	const registry = getTerminalDaemonRegistry();
	registry.cleanupStaleDaemons();

	const entries = registry
		.listActive()
		.filter((entry) => entry.state === "draining");
	for (const entry of entries) {
		let aliveSessions: number | null = null;
		try {
			const response = await client.listSessionsByGeneration(
				entry.generationId,
			);
			aliveSessions = response.sessions.filter(
				(session) => session.isAlive,
			).length;
		} catch (error) {
			if (DEBUG_TERMINAL) {
				console.warn(
					"[TerminalRollout] Failed to list sessions for draining generation",
					{
						generationId: entry.generationId,
						error: error instanceof Error ? error.message : String(error),
					},
				);
			}
		}

		const ageMs = Date.now() - Date.parse(entry.updatedAt);
		const shouldForceRetire = ageMs > MAX_DRAIN_AGE_MS;
		if (aliveSessions === null && !shouldForceRetire) {
			continue;
		}

		if (aliveSessions !== null && aliveSessions > 0 && !shouldForceRetire) {
			continue;
		}

		let shutdownResult: { wasRunning: boolean };
		try {
			shutdownResult = await client.shutdownGenerationIfRunning({
				generationId: entry.generationId,
				request: { killSessions: shouldForceRetire },
			});
		} catch (error) {
			if (DEBUG_TERMINAL) {
				console.warn(
					"[TerminalRollout] Failed to shutdown draining generation",
					{
						generationId: entry.generationId,
						error: error instanceof Error ? error.message : String(error),
					},
				);
			}
			continue;
		}

		if (shutdownResult.wasRunning) {
			try {
				const post = await client.listSessionsByGeneration(entry.generationId);
				const remainingAlive = post.sessions.filter(
					(session) => session.isAlive,
				).length;
				if (remainingAlive > 0) {
					if (DEBUG_TERMINAL) {
						console.warn(
							"[TerminalRollout] Skipping retirement; sessions still alive after shutdown",
							{
								generationId: entry.generationId,
								remainingAlive,
							},
						);
					}
					continue;
				}
			} catch (error) {
				if (DEBUG_TERMINAL) {
					console.warn(
						"[TerminalRollout] Skipping retirement; unable to verify post-shutdown sessions",
						{
							generationId: entry.generationId,
							error: error instanceof Error ? error.message : String(error),
						},
					);
				}
				continue;
			}
		}

		markGenerationRetired(entry.generationId);
		console.log("[TerminalRollout] Retired draining generation", {
			generationId: entry.generationId,
			forced: shouldForceRetire,
		});
	}
}

function startRolloutCoordinator(): void {
	if (rolloutReconcileTimer) {
		return;
	}

	const tick = () => {
		void reconcileDrainingGenerations().catch((error) => {
			if (DEBUG_TERMINAL) {
				console.warn("[TerminalRollout] Reconcile tick failed:", error);
			}
		});
	};

	rolloutReconcileTimer = setInterval(tick, ROLLOUT_RECONCILE_INTERVAL_MS);
	rolloutReconcileTimer.unref();
	tick();
}

/**
 * Reconcile daemon sessions on app startup.
 * Cleans up stale sessions from previous app runs and preserves sessions
 * that can be retained.
 */
export async function reconcileDaemonSessions(): Promise<void> {
	try {
		await ensurePreferredDaemonGeneration();
		startRolloutCoordinator();
		console.log("[TerminalRollout] Preferred generation ready", {
			generationId: getCurrentTerminalGenerationId(),
		});
	} catch (error) {
		console.warn(
			"[TerminalRollout] Failed to ensure preferred generation:",
			error,
		);
	}

	try {
		const manager = getDaemonTerminalManager();
		await manager.reconcileOnStartup();
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to reconcile daemon sessions:",
			error,
		);
	}
}

/**
 * Restart the terminal daemon. Kills all sessions, shuts down the daemon,
 * and resets the manager so a fresh daemon spawns on next use.
 */
export async function restartDaemon(): Promise<{ success: boolean }> {
	console.log("[restartDaemon] Starting daemon restart...");

	try {
		const client = getTerminalHostClient();
		const result = await client.shutdownIfRunning({ killSessions: true });
		console.log(
			result.wasRunning
				? "[restartDaemon] Existing daemon(s) shutdown requested"
				: "[restartDaemon] Daemon was not running",
		);
	} catch (error) {
		console.warn("[restartDaemon] Error during shutdown (continuing):", error);
	}

	const manager = getDaemonTerminalManager();
	manager.reset();

	console.log("[restartDaemon] Complete");

	return { success: true };
}

export async function tryListExistingDaemonSessions(): Promise<{
	sessions: ListSessionsResponse["sessions"];
}> {
	try {
		const client = getTerminalHostClient();
		const result = await client.listSessions();
		return { sessions: result.sessions };
	} catch (error) {
		console.warn(
			"[TerminalManager] Failed to list existing daemon sessions (getTerminalHostClient/client.listSessions):",
			error,
		);
		if (DEBUG_TERMINAL) {
			console.log(
				"[TerminalManager] Failed to list existing daemon sessions:",
				error,
			);
		}
		return { sessions: [] };
	}
}

/**
 * Best-effort terminal runtime warmup.
 * Runs in the background to reduce latency for the first user-opened terminal:
 * - precomputes locale/env fallback
 * - ensures daemon control/stream channels are established
 */
export function prewarmTerminalRuntime(): void {
	if (prewarmInFlight) return;

	prewarmInFlight = (async () => {
		try {
			prewarmTerminalEnv();
		} catch (error) {
			if (DEBUG_TERMINAL) {
				console.warn(
					"[TerminalManager] Failed to prewarm terminal env:",
					error,
				);
			}
		}

		try {
			await getTerminalHostClient().ensureConnected();
		} catch (error) {
			if (DEBUG_TERMINAL) {
				console.warn(
					"[TerminalManager] Failed to prewarm terminal daemon connection:",
					error,
				);
			}
		}
	})().finally(() => {
		prewarmInFlight = null;
	});
}
