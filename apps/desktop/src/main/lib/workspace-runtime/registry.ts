/**
 * Workspace Runtime Registry
 *
 * Process-scoped registry for workspace runtime providers.
 * The registry is cached for the lifetime of the process.
 *
 * Supports:
 * - LocalWorkspaceRuntime for local workspaces
 * - SSHWorkspaceRuntime for remote SSH workspaces
 *
 * Runtime selection is based on workspace metadata (sshConnectionId).
 */

import { LocalWorkspaceRuntime } from "./local";
import { SSHWorkspaceRuntime } from "./ssh";
import type { WorkspaceRuntime, WorkspaceRuntimeRegistry } from "./types";
import type { SSHConnectionConfig } from "../ssh/types";

// =============================================================================
// Extended Registry Interface
// =============================================================================

/**
 * Extended registry interface with SSH support.
 */
export interface ExtendedWorkspaceRuntimeRegistry extends WorkspaceRuntimeRegistry {
	/**
	 * Get or create an SSH runtime for a connection.
	 * Reuses existing runtime if already connected to the same host.
	 */
	getSSHRuntime(config: SSHConnectionConfig): SSHWorkspaceRuntime;

	/**
	 * Register a workspace as using SSH.
	 * Call this when a workspace is associated with an SSH connection.
	 */
	registerSSHWorkspace(workspaceId: string, sshConnectionId: string): void;

	/**
	 * Unregister a workspace from SSH.
	 */
	unregisterSSHWorkspace(workspaceId: string): void;

	/**
	 * Check if a workspace is using SSH.
	 */
	isSSHWorkspace(workspaceId: string): boolean;

	/**
	 * Get all active SSH runtimes.
	 */
	getActiveSSHRuntimes(): Map<string, SSHWorkspaceRuntime>;

	/**
	 * Disconnect and remove an SSH runtime.
	 */
	disconnectSSHRuntime(sshConnectionId: string): Promise<void>;

	/**
	 * Cleanup all runtimes.
	 */
	cleanupAll(): Promise<void>;
}

// =============================================================================
// Registry Implementation
// =============================================================================

/**
 * Default registry implementation with SSH support.
 *
 * - Local workspaces use LocalWorkspaceRuntime
 * - SSH workspaces use SSHWorkspaceRuntime based on their sshConnectionId
 */
class DefaultWorkspaceRuntimeRegistry implements ExtendedWorkspaceRuntimeRegistry {
	private localRuntime: LocalWorkspaceRuntime | null = null;
	private sshRuntimes: Map<string, SSHWorkspaceRuntime> = new Map();
	private workspaceToSSH: Map<string, string> = new Map(); // workspaceId -> sshConnectionId
	private sshConfigs: Map<string, SSHConnectionConfig> = new Map(); // sshConnectionId -> config

	/**
	 * Get the runtime for a specific workspace.
	 *
	 * Returns SSH runtime if workspace is registered as SSH, otherwise local.
	 */
	getForWorkspaceId(workspaceId: string): WorkspaceRuntime {
		const sshConnectionId = this.workspaceToSSH.get(workspaceId);
		if (sshConnectionId) {
			const sshRuntime = this.sshRuntimes.get(sshConnectionId);
			if (sshRuntime) {
				return sshRuntime;
			}
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
	 * Get or create an SSH runtime for a connection configuration.
	 */
	getSSHRuntime(config: SSHConnectionConfig): SSHWorkspaceRuntime {
		let runtime = this.sshRuntimes.get(config.id);
		if (!runtime) {
			console.log(`[registry] Creating new SSH runtime for ${config.name} (${config.host})`);
			runtime = new SSHWorkspaceRuntime(config);
			this.sshRuntimes.set(config.id, runtime);
			this.sshConfigs.set(config.id, config);
		}
		return runtime;
	}

	/**
	 * Register a workspace as using SSH.
	 */
	registerSSHWorkspace(workspaceId: string, sshConnectionId: string): void {
		console.log(`[registry] Registering workspace ${workspaceId} with SSH connection ${sshConnectionId}`);
		this.workspaceToSSH.set(workspaceId, sshConnectionId);
	}

	/**
	 * Unregister a workspace from SSH.
	 */
	unregisterSSHWorkspace(workspaceId: string): void {
		this.workspaceToSSH.delete(workspaceId);
	}

	/**
	 * Check if a workspace is using SSH.
	 */
	isSSHWorkspace(workspaceId: string): boolean {
		return this.workspaceToSSH.has(workspaceId);
	}

	/**
	 * Get all active SSH runtimes.
	 */
	getActiveSSHRuntimes(): Map<string, SSHWorkspaceRuntime> {
		return new Map(this.sshRuntimes);
	}

	/**
	 * Disconnect and remove an SSH runtime.
	 */
	async disconnectSSHRuntime(sshConnectionId: string): Promise<void> {
		const runtime = this.sshRuntimes.get(sshConnectionId);
		if (runtime) {
			console.log(`[registry] Disconnecting SSH runtime for ${sshConnectionId}`);
			await runtime.terminal.cleanup();
			runtime.disconnect();
			this.sshRuntimes.delete(sshConnectionId);
			this.sshConfigs.delete(sshConnectionId);

			// Remove all workspace mappings for this SSH connection
			for (const [workspaceId, connId] of this.workspaceToSSH) {
				if (connId === sshConnectionId) {
					this.workspaceToSSH.delete(workspaceId);
				}
			}
		}
	}

	/**
	 * Cleanup all runtimes.
	 */
	async cleanupAll(): Promise<void> {
		// Cleanup local runtime
		if (this.localRuntime) {
			await this.localRuntime.terminal.cleanup();
		}

		// Cleanup all SSH runtimes
		for (const [id, runtime] of this.sshRuntimes) {
			console.log(`[registry] Cleaning up SSH runtime ${id}`);
			await runtime.terminal.cleanup();
			runtime.disconnect();
		}
		this.sshRuntimes.clear();
		this.sshConfigs.clear();
		this.workspaceToSSH.clear();
	}
}

// =============================================================================
// Singleton Instance
// =============================================================================

let registryInstance: ExtendedWorkspaceRuntimeRegistry | null = null;

/**
 * Get the workspace runtime registry.
 *
 * The registry is process-scoped and cached. Callers should capture it once
 * (e.g., when creating a tRPC router) and use it for the lifetime of the router.
 *
 * This design allows:
 * 1. Stable runtime instances (no re-creation on each call)
 * 2. Consistent event wiring (same backend for all listeners)
 * 3. Per-workspace selection (local vs SSH)
 */
export function getWorkspaceRuntimeRegistry(): ExtendedWorkspaceRuntimeRegistry {
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
