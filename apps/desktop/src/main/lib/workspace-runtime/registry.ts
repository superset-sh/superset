/**
 * Workspace Runtime Registry
 *
 * Process-scoped registry for workspace runtime providers.
 * The registry is cached for the lifetime of the process.
 *
 * Behavior:
 * - Local workspaces use LocalWorkspaceRuntime
 * - Remote (SSH) workspaces use RemoteSSHWorkspaceRuntime
 * - Per-workspace selection based on workspace metadata (type + sshConnectionId)
 */

import { sshConnections, workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { LocalWorkspaceRuntime } from "./local";
import { RemoteSSHWorkspaceRuntime } from "./remote-ssh";
import { getPoolKey } from "./remote-ssh/types";
import type { WorkspaceRuntime, WorkspaceRuntimeRegistry } from "./types";

const MAX_REMOTE_RUNTIMES = 20;
const REMOTE_RUNTIME_TTL_MS = 30 * 60 * 1000; // 30 minutes
const REMOTE_RUNTIME_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

type RemoteRuntimeEntry = {
	runtime: RemoteSSHWorkspaceRuntime;
	lastUsedAt: number;
};

type RemoteRuntimeConfig = {
	id: string;
	host: string;
	port: number;
	username: string;
	identityFile?: string;
	useAgent?: boolean;
};

// =============================================================================
// Registry Implementation
// =============================================================================

/**
 * Default registry implementation.
 *
 * Routes workspaces to the correct runtime:
 * - type="remote" + sshConnectionId → RemoteSSHWorkspaceRuntime
 * - Otherwise → LocalWorkspaceRuntime
 *
 * Remote runtimes are cached by connection pool key (user@host:port).
 */
class DefaultWorkspaceRuntimeRegistry implements WorkspaceRuntimeRegistry {
	private localRuntime: LocalWorkspaceRuntime | null = null;
	private remoteRuntimes = new Map<string, RemoteRuntimeEntry>();
	private staleCleanupTimer: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.staleCleanupTimer = setInterval(() => {
			this.cleanupStaleRemoteRuntimes();
		}, REMOTE_RUNTIME_CLEANUP_INTERVAL_MS);
		this.staleCleanupTimer.unref?.();
	}

	/**
	 * Get the runtime for a specific workspace.
	 *
	 * Checks workspace metadata to select local vs remote SSH runtime.
	 */
	getForWorkspaceId(workspaceId: string): WorkspaceRuntime {
		try {
			const workspace = localDb
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, workspaceId))
				.get();

			if (workspace?.type === "remote" && workspace.sshConnectionId) {
				const sshConn = localDb
					.select()
					.from(sshConnections)
					.where(eq(sshConnections.id, workspace.sshConnectionId))
					.get();

				if (sshConn) {
					return this.getOrCreateRemoteRuntime({
						id: sshConn.id,
						host: sshConn.host,
						port: sshConn.port,
						username: sshConn.username,
						identityFile: sshConn.privateKeyPath ?? undefined,
						useAgent: sshConn.authMethod === "ssh-agent",
					});
				}
			}
		} catch {
			// Database not ready or workspace not found — fall through to default
		}

		return this.getDefault();
	}

	/**
	 * Get the default runtime (for global/legacy endpoints).
	 */
	getDefault(): WorkspaceRuntime {
		if (!this.localRuntime) {
			this.localRuntime = new LocalWorkspaceRuntime();
		}
		return this.localRuntime;
	}

	/**
	 * Get or create a cached remote SSH runtime for a given host config.
	 */
	private getOrCreateRemoteRuntime(config: {
		id: string;
		host: string;
		port: number;
		username: string;
		identityFile?: string;
		useAgent?: boolean;
	}): RemoteSSHWorkspaceRuntime {
		const key = getPoolKey(config);
		const existingEntry = this.remoteRuntimes.get(key);
		if (existingEntry) {
			this.touchRemoteRuntime(key, existingEntry.runtime);
			this.ensureRemoteRuntimeHealthy(key, existingEntry.runtime, config);
			return existingEntry.runtime;
		}

		const runtime = new RemoteSSHWorkspaceRuntime(config);
		this.touchRemoteRuntime(key, runtime);
		this.enforceRemoteRuntimeCapacity();

		// Lazily connect — don't block registry lookup
		this.ensureRemoteRuntimeHealthy(key, runtime, config);

		return runtime;
	}

	private ensureRemoteRuntimeHealthy(
		key: string,
		runtime: RemoteSSHWorkspaceRuntime,
		config: RemoteRuntimeConfig,
	): void {
		void runtime.ensureConnected().catch((err) => {
			const current = this.remoteRuntimes.get(key);
			// Runtime was already replaced/evicted; ignore stale failure.
			if (!current || current.runtime !== runtime) return;

			console.warn(
				`[Registry] SSH runtime unhealthy for ${key}; evicting and retrying with fresh runtime:`,
				err,
			);

			this.remoteRuntimes.delete(key);
			void runtime.dispose().catch((disposeError) => {
				console.warn(
					`[Registry] Failed to dispose unhealthy SSH runtime ${key}:`,
					disposeError,
				);
			});

			const replacement = new RemoteSSHWorkspaceRuntime(config);
			this.touchRemoteRuntime(key, replacement);
			this.enforceRemoteRuntimeCapacity();

			void replacement.ensureConnected().catch((retryErr) => {
				const latest = this.remoteRuntimes.get(key);
				if (latest?.runtime === replacement) {
					this.remoteRuntimes.delete(key);
				}
				void replacement.dispose().catch((disposeError) => {
					console.warn(
						`[Registry] Failed to dispose replacement SSH runtime ${key}:`,
						disposeError,
					);
				});
				console.error(
					`[Registry] Failed to reconnect replacement SSH runtime ${key}:`,
					retryErr,
				);
			});
		});
	}

	private touchRemoteRuntime(
		key: string,
		runtime: RemoteSSHWorkspaceRuntime,
	): void {
		// Re-insert to update access order (Map preserves insertion order),
		// enabling least-recently-used eviction via first key.
		this.remoteRuntimes.delete(key);
		this.remoteRuntimes.set(key, {
			runtime,
			lastUsedAt: Date.now(),
		});
	}

	private enforceRemoteRuntimeCapacity(): void {
		while (this.remoteRuntimes.size > MAX_REMOTE_RUNTIMES) {
			const lruKey = this.remoteRuntimes.keys().next().value as
				| string
				| undefined;
			if (!lruKey) return;
			this.evictRemoteRuntime(lruKey, "lru");
		}
	}

	private cleanupStaleRemoteRuntimes(): void {
		const now = Date.now();
		for (const [key, entry] of this.remoteRuntimes.entries()) {
			if (now - entry.lastUsedAt > REMOTE_RUNTIME_TTL_MS) {
				this.evictRemoteRuntime(key, "ttl");
			}
		}
	}

	private evictRemoteRuntime(key: string, reason: "lru" | "ttl"): void {
		const entry = this.remoteRuntimes.get(key);
		if (!entry) return;
		this.remoteRuntimes.delete(key);
		void entry.runtime.dispose().catch((error) => {
			console.warn(
				`[Registry] Failed to dispose SSH runtime ${key} during ${reason} eviction:`,
				error,
			);
		});
	}

	dispose(): void {
		if (this.staleCleanupTimer) {
			clearInterval(this.staleCleanupTimer);
			this.staleCleanupTimer = null;
		}

		for (const [key, entry] of this.remoteRuntimes.entries()) {
			this.remoteRuntimes.delete(key);
			void entry.runtime.dispose().catch((error) => {
				console.warn(`[Registry] Failed to dispose SSH runtime ${key}:`, error);
			});
		}
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let registryInstance: WorkspaceRuntimeRegistry | null = null;

/**
 * Get the workspace runtime registry.
 *
 * The registry is process-scoped and cached. Callers should capture it once
 * (e.g., when creating a tRPC router) and use it for the lifetime of the router.
 */
export function getWorkspaceRuntimeRegistry(): WorkspaceRuntimeRegistry {
	if (!registryInstance) {
		registryInstance = new DefaultWorkspaceRuntimeRegistry();
	}
	return registryInstance;
}

/**
 * Reset the registry (for testing only).
 * This should not be called in production code.
 */
export function resetWorkspaceRuntimeRegistry(): void {
	if (registryInstance instanceof DefaultWorkspaceRuntimeRegistry) {
		registryInstance.dispose();
	}
	registryInstance = null;
}
