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

export { LocalWorkspaceRuntime } from "./local";
export {
	DefaultWorkspaceRuntimeRegistry,
	getWorkspaceRuntimeRegistry,
	resetWorkspaceRuntimeRegistry,
} from "./registry";
export { SshWorkspaceRuntime } from "./ssh";
export { SshTerminalRuntime } from "./ssh-terminal-runtime";
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
