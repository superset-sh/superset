/**
 * Workspace Runtime Registry
 *
 * Process-scoped registry for workspace runtime providers.
 * The registry is cached for the lifetime of the process.
 *
 * Current behavior:
 * - All workspaces use the LocalWorkspaceRuntime
 * - The runtime is selected once based on settings (requires restart to change)
 *
 * Future behavior (cloud readiness):
 * - Per-workspace selection based on workspace metadata (cloudWorkspaceId, etc.)
 * - Local + cloud workspaces can coexist
 */

import { workspaces } from "@superset/local-db";
import { isNull } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { LocalWorkspaceRuntime } from "./local";
import { SshWorkspaceRuntime } from "./ssh";
import type { WorkspaceRuntime, WorkspaceRuntimeRegistry } from "./types";

// =============================================================================
// Registry Implementation
// =============================================================================

/**
 * Default registry implementation.
 *
 * Currently returns the same LocalWorkspaceRuntime for all workspaces.
 * The interface supports per-workspace selection for future cloud work.
 */
export class DefaultWorkspaceRuntimeRegistry
	implements WorkspaceRuntimeRegistry
{
	private localRuntime: LocalWorkspaceRuntime | null = null;

	/** workspaceId → hostId for remote workspaces */
	private readonly remoteWorkspaceMap = new Map<string, string>();

	/** hostId → SshWorkspaceRuntime (cached per host) */
	private readonly sshRuntimes = new Map<string, SshWorkspaceRuntime>();

	/** Whether hydrateRemoteWorkspaces() has been called */
	private hydrated = false;

	/**
	 * Populate remoteWorkspaceMap from the local-db on first access.
	 * This ensures remote workspaces are restored correctly after app restart.
	 */
	private hydrateRemoteWorkspaces(): void {
		if (this.hydrated) return;
		this.hydrated = true;

		const remoteWorkspaces = localDb
			.select()
			.from(workspaces)
			.where(isNull(workspaces.deletingAt))
			.all()
			.filter((w) => w.type === "remote" && w.sshHostId);

		for (const workspace of remoteWorkspaces) {
			if (workspace.sshHostId) {
				this.remoteWorkspaceMap.set(workspace.id, workspace.sshHostId);
			}
		}
	}

	/**
	 * Get the runtime for a specific workspace.
	 *
	 * Returns an SshWorkspaceRuntime when the workspace has been registered as
	 * remote via registerRemoteWorkspace(). Otherwise returns the local runtime.
	 */
	getForWorkspaceId(workspaceId: string): WorkspaceRuntime {
		this.hydrateRemoteWorkspaces();
		const hostId = this.remoteWorkspaceMap.get(workspaceId);
		if (hostId) {
			return this._getOrCreateSshRuntime(hostId);
		}
		return this.getDefault();
	}

	/**
	 * Get the default runtime (for global/legacy endpoints).
	 *
	 * Returns the local runtime, lazily initialized.
	 * The runtime instance is cached for the lifetime of the process.
	 */
	getDefault(): WorkspaceRuntime {
		if (!this.localRuntime) {
			this.localRuntime = new LocalWorkspaceRuntime();
		}
		return this.localRuntime;
	}

	/**
	 * Register a workspace as remote, associating it with an SSH host.
	 * Call this when a remote workspace is created or opened so that
	 * getForWorkspaceId() can return the correct SSH runtime.
	 */
	registerRemoteWorkspace(workspaceId: string, hostId: string): void {
		this.remoteWorkspaceMap.set(workspaceId, hostId);
	}

	/**
	 * Unregister a remote workspace mapping.
	 * Call this when a remote workspace is deleted or closed.
	 * Does not destroy the SshWorkspaceRuntime (the host may still have other workspaces).
	 */
	unregisterRemoteWorkspace(workspaceId: string): void {
		this.remoteWorkspaceMap.delete(workspaceId);
	}

	/** Get or create a cached SshWorkspaceRuntime for the given hostId. */
	private _getOrCreateSshRuntime(hostId: string): SshWorkspaceRuntime {
		let runtime = this.sshRuntimes.get(hostId);
		if (!runtime) {
			runtime = new SshWorkspaceRuntime(hostId);
			this.sshRuntimes.set(hostId, runtime);
		}
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
 *
 * This design allows:
 * 1. Stable runtime instances (no re-creation on each call)
 * 2. Consistent event wiring (same backend for all listeners)
 * 3. Future per-workspace selection (local vs cloud)
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
