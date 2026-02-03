/**
 * Workspace Runtime Module
 *
 * This module provides the workspace-scoped runtime abstraction.
 * Use getWorkspaceRuntimeRegistry() to get the registry and select
 * the appropriate runtime for a workspace.
 *
 * Example usage:
 * ```typescript
 * const registry = getWorkspaceRuntimeRegistry();
 * const runtime = registry.getForWorkspaceId(workspaceId);
 * const result = await runtime.terminal.createOrAttach(params);
 * ```
 */

export {
	type CloudEvent,
	type CloudSessionConfig,
	type CloudSessionState,
	CloudWorkspaceRuntime,
} from "./cloud";
export { LocalWorkspaceRuntime } from "./local";
export {
	getWorkspaceRuntimeRegistry,
	resetWorkspaceRuntimeRegistry,
} from "./registry";
export type {
	TerminalCapabilities,
	TerminalEventSource,
	TerminalManagement,
	TerminalRuntime,
	TerminalSessionOperations,
	TerminalWorkspaceOperations,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
	WorkspaceRuntimeRegistry,
} from "./types";
