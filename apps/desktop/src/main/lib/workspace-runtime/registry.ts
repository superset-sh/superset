/**
 * Workspace Runtime Registry
 *
 * Process-scoped registry for workspace runtime providers.
 * The registry is cached for the lifetime of the process.
 *
 * Supports:
 * - LocalWorkspaceRuntime for local workspaces
 * - SSHWorkspaceRuntime for remote SSH workspaces
 * - CloudWorkspaceRuntime for cloud-hosted workspaces (extensible)
 *
 * Runtime selection is based on workspace metadata (sshConnectionId, cloudProviderId, etc.).
 */

import type { SSHConnectionConfig } from "../ssh/types";
import { LocalWorkspaceRuntime } from "./local";
import { SSHWorkspaceRuntime } from "./ssh";
import type { WorkspaceRuntime, WorkspaceRuntimeRegistry } from "./types";

// =============================================================================
// Remote Workspace Types
// =============================================================================

/**
 * Remote workspace types supported by the registry.
 * Extensible for future cloud providers.
 */
export type RemoteWorkspaceType = "ssh" | "cloud";

/**
 * Mapping info for a remote workspace.
 */
interface RemoteWorkspaceMapping {
	type: RemoteWorkspaceType;
	runtimeId: string; // sshConnectionId or cloudProviderId
}

/**
 * Interface for cloud workspace runtimes.
 * Cloud providers should implement this interface to integrate with the registry.
 *
 * Example implementation:
 * ```typescript
 * class FreestyleWorkspaceRuntime implements CloudWorkspaceRuntime {
 *   readonly id: string;
 *   readonly terminal: TerminalRuntime;
 *   readonly capabilities: { terminal: TerminalCapabilities };
 *
 *   async connect(): Promise<void> { ... }
 *   disconnect(): void { ... }
 *   isConnected(): boolean { ... }
 * }
 * ```
 */
export interface CloudWorkspaceRuntime extends WorkspaceRuntime {
	connect(): Promise<void>;
	disconnect(): void;
	isConnected(): boolean;
}

// =============================================================================
// Extended Registry Interface
// =============================================================================

/**
 * Extended registry interface with SSH and cloud workspace support.
 */
export interface ExtendedWorkspaceRuntimeRegistry
	extends WorkspaceRuntimeRegistry {
	// ===========================================================================
	// Generic Remote Workspace Methods
	// ===========================================================================

	/**
	 * Get the remote workspace type for a workspace.
	 * Returns undefined if the workspace is local.
	 */
	getWorkspaceType(workspaceId: string): RemoteWorkspaceType | undefined;

	/**
	 * Unregister any remote workspace mapping.
	 */
	unregisterRemoteWorkspace(workspaceId: string): void;

	// ===========================================================================
	// SSH Workspace Methods
	// ===========================================================================

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
	 * @deprecated Use unregisterRemoteWorkspace instead
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

	// ===========================================================================
	// Cloud Workspace Methods
	// ===========================================================================

	/**
	 * Register a cloud runtime with the registry.
	 * Call this when initializing a cloud provider.
	 *
	 * @param providerId Unique identifier for the cloud provider instance
	 * @param runtime The cloud workspace runtime implementation
	 */
	registerCloudRuntime(
		providerId: string,
		runtime: CloudWorkspaceRuntime,
	): void;

	/**
	 * Get a cloud runtime by provider ID.
	 * Returns undefined if no runtime is registered for this provider.
	 */
	getCloudRuntime(providerId: string): CloudWorkspaceRuntime | undefined;

	/**
	 * Register a workspace as using a cloud provider.
	 * Call this when a workspace is associated with a cloud VM.
	 */
	registerCloudWorkspace(workspaceId: string, providerId: string): void;

	/**
	 * Check if a workspace is using a cloud provider.
	 */
	isCloudWorkspace(workspaceId: string): boolean;

	/**
	 * Get all active cloud runtimes.
	 */
	getActiveCloudRuntimes(): Map<string, CloudWorkspaceRuntime>;

	/**
	 * Disconnect and remove a cloud runtime.
	 */
	disconnectCloudRuntime(providerId: string): Promise<void>;

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/**
	 * Cleanup all runtimes (local, SSH, and cloud).
	 */
	cleanupAll(): Promise<void>;
}

// =============================================================================
// Registry Implementation
// =============================================================================

/**
 * Default registry implementation with SSH and cloud workspace support.
 *
 * - Local workspaces use LocalWorkspaceRuntime
 * - SSH workspaces use SSHWorkspaceRuntime based on their sshConnectionId
 * - Cloud workspaces use CloudWorkspaceRuntime based on their providerId
 */
class DefaultWorkspaceRuntimeRegistry
	implements ExtendedWorkspaceRuntimeRegistry
{
	private localRuntime: LocalWorkspaceRuntime | null = null;
	private sshRuntimes: Map<string, SSHWorkspaceRuntime> = new Map();
	private cloudRuntimes: Map<string, CloudWorkspaceRuntime> = new Map();
	private workspaceToRemote: Map<string, RemoteWorkspaceMapping> = new Map(); // workspaceId -> mapping
	private sshConfigs: Map<string, SSHConnectionConfig> = new Map(); // sshConnectionId -> config

	/**
	 * Get the runtime for a specific workspace.
	 *
	 * Returns the appropriate runtime based on workspace type:
	 * - SSH runtime for SSH workspaces
	 * - Cloud runtime for cloud workspaces
	 * - Local runtime for everything else
	 */
	getForWorkspaceId(workspaceId: string): WorkspaceRuntime {
		const mapping = this.workspaceToRemote.get(workspaceId);
		if (mapping) {
			if (mapping.type === "ssh") {
				const sshRuntime = this.sshRuntimes.get(mapping.runtimeId);
				if (sshRuntime) {
					return sshRuntime;
				}
				console.warn(
					`[registry] Workspace ${workspaceId} mapped to SSH ${mapping.runtimeId} but runtime not found, falling back to local`,
				);
			} else if (mapping.type === "cloud") {
				const cloudRuntime = this.cloudRuntimes.get(mapping.runtimeId);
				if (cloudRuntime) {
					return cloudRuntime;
				}
				console.warn(
					`[registry] Workspace ${workspaceId} mapped to cloud ${mapping.runtimeId} but runtime not found, falling back to local`,
				);
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

	// ===========================================================================
	// Generic Remote Workspace Methods
	// ===========================================================================

	/**
	 * Get the remote workspace type for a workspace.
	 */
	getWorkspaceType(workspaceId: string): RemoteWorkspaceType | undefined {
		return this.workspaceToRemote.get(workspaceId)?.type;
	}

	/**
	 * Unregister any remote workspace mapping.
	 */
	unregisterRemoteWorkspace(workspaceId: string): void {
		this.workspaceToRemote.delete(workspaceId);
	}

	// ===========================================================================
	// SSH Workspace Methods
	// ===========================================================================

	/**
	 * Get or create an SSH runtime for a connection configuration.
	 */
	getSSHRuntime(config: SSHConnectionConfig): SSHWorkspaceRuntime {
		let runtime = this.sshRuntimes.get(config.id);
		if (!runtime) {
			console.log(
				`[registry] Creating new SSH runtime for ${config.name} (${config.host})`,
			);
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
		console.log(
			`[registry] Registering workspace ${workspaceId} with SSH connection ${sshConnectionId}`,
		);
		this.workspaceToRemote.set(workspaceId, {
			type: "ssh",
			runtimeId: sshConnectionId,
		});
	}

	/**
	 * Unregister a workspace from SSH.
	 * @deprecated Use unregisterRemoteWorkspace instead
	 */
	unregisterSSHWorkspace(workspaceId: string): void {
		this.unregisterRemoteWorkspace(workspaceId);
	}

	/**
	 * Check if a workspace is using SSH.
	 */
	isSSHWorkspace(workspaceId: string): boolean {
		return this.workspaceToRemote.get(workspaceId)?.type === "ssh";
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
			console.log(
				`[registry] Disconnecting SSH runtime for ${sshConnectionId}`,
			);
			let cleanupError: Error | undefined;
			let disconnectError: Error | undefined;
			try {
				await runtime.terminal.cleanup();
			} catch (error) {
				cleanupError =
					error instanceof Error ? error : new Error(String(error));
				console.error(
					`[registry] Error cleaning up SSH runtime ${sshConnectionId}:`,
					cleanupError.message,
				);
			} finally {
				// Always disconnect even if cleanup failed
				try {
					runtime.disconnect();
				} catch (error) {
					disconnectError =
						error instanceof Error ? error : new Error(String(error));
					console.error(
						`[registry] Error disconnecting SSH runtime ${sshConnectionId}:`,
						disconnectError.message,
					);
				}

				// Always clean up state even if cleanup/disconnect failed
				this.sshRuntimes.delete(sshConnectionId);
				this.sshConfigs.delete(sshConnectionId);

				// Remove all workspace mappings for this SSH connection
				for (const [workspaceId, mapping] of this.workspaceToRemote) {
					if (mapping.type === "ssh" && mapping.runtimeId === sshConnectionId) {
						this.workspaceToRemote.delete(workspaceId);
					}
				}
			}
			// Propagate the first error encountered
			if (cleanupError) {
				throw cleanupError;
			}
			if (disconnectError) {
				throw disconnectError;
			}
		}
	}

	// ===========================================================================
	// Cloud Workspace Methods
	// ===========================================================================

	/**
	 * Register a cloud runtime with the registry.
	 */
	registerCloudRuntime(
		providerId: string,
		runtime: CloudWorkspaceRuntime,
	): void {
		console.log(
			`[registry] Registering cloud runtime for provider ${providerId}`,
		);
		this.cloudRuntimes.set(providerId, runtime);
	}

	/**
	 * Get a cloud runtime by provider ID.
	 */
	getCloudRuntime(providerId: string): CloudWorkspaceRuntime | undefined {
		return this.cloudRuntimes.get(providerId);
	}

	/**
	 * Register a workspace as using a cloud provider.
	 */
	registerCloudWorkspace(workspaceId: string, providerId: string): void {
		console.log(
			`[registry] Registering workspace ${workspaceId} with cloud provider ${providerId}`,
		);
		this.workspaceToRemote.set(workspaceId, {
			type: "cloud",
			runtimeId: providerId,
		});
	}

	/**
	 * Check if a workspace is using a cloud provider.
	 */
	isCloudWorkspace(workspaceId: string): boolean {
		return this.workspaceToRemote.get(workspaceId)?.type === "cloud";
	}

	/**
	 * Get all active cloud runtimes.
	 */
	getActiveCloudRuntimes(): Map<string, CloudWorkspaceRuntime> {
		return new Map(this.cloudRuntimes);
	}

	/**
	 * Disconnect and remove a cloud runtime.
	 */
	async disconnectCloudRuntime(providerId: string): Promise<void> {
		const runtime = this.cloudRuntimes.get(providerId);
		if (runtime) {
			console.log(`[registry] Disconnecting cloud runtime for ${providerId}`);
			let cleanupError: Error | undefined;
			let disconnectError: Error | undefined;
			try {
				await runtime.terminal.cleanup();
			} catch (error) {
				cleanupError =
					error instanceof Error ? error : new Error(String(error));
				console.error(
					`[registry] Error cleaning up cloud runtime ${providerId}:`,
					cleanupError.message,
				);
			} finally {
				// Always disconnect even if cleanup failed
				try {
					runtime.disconnect();
				} catch (error) {
					disconnectError =
						error instanceof Error ? error : new Error(String(error));
					console.error(
						`[registry] Error disconnecting cloud runtime ${providerId}:`,
						disconnectError.message,
					);
				}

				// Always clean up state even if cleanup/disconnect failed
				this.cloudRuntimes.delete(providerId);

				// Remove all workspace mappings for this cloud provider
				for (const [workspaceId, mapping] of this.workspaceToRemote) {
					if (mapping.type === "cloud" && mapping.runtimeId === providerId) {
						this.workspaceToRemote.delete(workspaceId);
					}
				}
			}
			// Propagate the first error encountered
			if (cleanupError) {
				throw cleanupError;
			}
			if (disconnectError) {
				throw disconnectError;
			}
		}
	}

	// ===========================================================================
	// Lifecycle
	// ===========================================================================

	/**
	 * Cleanup all runtimes (local, SSH, and cloud).
	 */
	async cleanupAll(): Promise<void> {
		// Cleanup local runtime
		if (this.localRuntime) {
			try {
				await this.localRuntime.terminal.cleanup();
			} catch (error) {
				console.error(
					`[registry] Error cleaning up local runtime:`,
					error instanceof Error ? error.message : String(error),
				);
			}
		}

		// Cleanup all SSH runtimes (continue even if individual cleanups fail)
		for (const [id, runtime] of this.sshRuntimes) {
			console.log(`[registry] Cleaning up SSH runtime ${id}`);
			try {
				await runtime.terminal.cleanup();
			} catch (error) {
				console.error(
					`[registry] Error cleaning up SSH runtime ${id}:`,
					error instanceof Error ? error.message : String(error),
				);
			} finally {
				// Always disconnect even if cleanup failed
				try {
					runtime.disconnect();
				} catch (disconnectError) {
					console.error(
						`[registry] Error disconnecting SSH runtime ${id}:`,
						disconnectError instanceof Error
							? disconnectError.message
							: String(disconnectError),
					);
				}
			}
		}

		// Cleanup all cloud runtimes (continue even if individual cleanups fail)
		for (const [id, runtime] of this.cloudRuntimes) {
			console.log(`[registry] Cleaning up cloud runtime ${id}`);
			try {
				await runtime.terminal.cleanup();
			} catch (error) {
				console.error(
					`[registry] Error cleaning up cloud runtime ${id}:`,
					error instanceof Error ? error.message : String(error),
				);
			} finally {
				// Always disconnect even if cleanup failed
				try {
					runtime.disconnect();
				} catch (disconnectError) {
					console.error(
						`[registry] Error disconnecting cloud runtime ${id}:`,
						disconnectError instanceof Error
							? disconnectError.message
							: String(disconnectError),
					);
				}
			}
		}

		this.sshRuntimes.clear();
		this.cloudRuntimes.clear();
		this.sshConfigs.clear();
		this.workspaceToRemote.clear();
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
