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

import { sshWorkspaceConfigSchema, workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { localDb } from "../local-db";
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
class DefaultWorkspaceRuntimeRegistry implements WorkspaceRuntimeRegistry {
	private localRuntime: LocalWorkspaceRuntime | null = null;
	private readonly sshRuntimes = new Map<string, SshWorkspaceRuntime>();

	getForWorkspaceId(workspaceId: string): WorkspaceRuntime {
		const cached = this.sshRuntimes.get(workspaceId);
		if (cached) {
			return cached;
		}

		const workspace = localDb
			.select({
				type: workspaces.type,
				sshConfig: workspaces.sshConfig,
			})
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();

		if (workspace?.type === "ssh" && workspace.sshConfig != null) {
			const config = sshWorkspaceConfigSchema.parse(workspace.sshConfig);
			const runtime = new SshWorkspaceRuntime(workspaceId, config);
			this.sshRuntimes.set(workspaceId, runtime);
			return runtime;
		}

		return this.getDefault();
	}

	getDefault(): WorkspaceRuntime {
		if (!this.localRuntime) {
			this.localRuntime = new LocalWorkspaceRuntime();
		}
		return this.localRuntime;
	}

	removeRuntime(workspaceId: string): void {
		const runtime = this.sshRuntimes.get(workspaceId);
		if (runtime) {
			runtime.cleanup().catch(() => {});
			this.sshRuntimes.delete(workspaceId);
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
