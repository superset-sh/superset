/**
 * SSH Workspace Runtime
 *
 * Implements the WorkspaceRuntime interface for SSH-connected remote workspaces.
 * Each instance is scoped to a single SSH host identified by hostId.
 */

import { getSshConnectionManager } from "../ssh";
import { SshTerminalRuntime } from "./ssh-terminal-runtime";
import type {
	TerminalRuntime,
	WorkspaceRuntime,
	WorkspaceRuntimeId,
} from "./types";

// =============================================================================
// SSH Workspace Runtime
// =============================================================================

/**
 * Workspace runtime for remote SSH hosts.
 *
 * Wraps SshTerminalRuntime and exposes it through the WorkspaceRuntime interface.
 * The runtime id is `ssh-${hostId}` to ensure uniqueness across hosts.
 */
export class SshWorkspaceRuntime implements WorkspaceRuntime {
	readonly id: WorkspaceRuntimeId;
	readonly terminal: TerminalRuntime;
	readonly capabilities: WorkspaceRuntime["capabilities"];

	constructor(hostId: string) {
		this.id = `ssh-${hostId}`;
		const sshManager = getSshConnectionManager();
		this.terminal = new SshTerminalRuntime(hostId, sshManager);
		this.capabilities = {
			terminal: this.terminal.capabilities,
		};
	}
}
