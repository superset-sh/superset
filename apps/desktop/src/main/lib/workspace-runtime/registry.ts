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
	private remoteRuntimes = new Map<string, RemoteSSHWorkspaceRuntime>();

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
		const existing = this.remoteRuntimes.get(key);
		if (existing) return existing;

		const runtime = new RemoteSSHWorkspaceRuntime(config);
		this.remoteRuntimes.set(key, runtime);

		// Lazily connect — don't block registry lookup
		void runtime.ensureConnected().catch((err) => {
			console.error(`[Registry] Failed to connect SSH runtime ${key}:`, err);
		});

		return runtime;
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
	registryInstance = null;
}
