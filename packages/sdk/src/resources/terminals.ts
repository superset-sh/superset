import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";

/**
 * Terminals are PTY sessions that live on a developer's host service, scoped
 * to a workspace. Creating one is routed to the workspace's host through the
 * relay tunnel.
 */
export class Terminals extends APIResource {
	/**
	 * Create a terminal session in an existing workspace on its host,
	 * optionally running `command`.
	 */
	async create(params: TerminalCreateParams): Promise<TerminalCreateResult> {
		this._requireOrgId();
		return this._client.hostMutation<TerminalCreateResult>(
			params.hostId,
			"terminal.createSession",
			{
				workspaceId: params.workspaceId,
				initialCommand: params.command,
				cwd: params.cwd,
			},
		);
	}

	private _requireOrgId(): string {
		if (!this._client.organizationId) {
			throw new SupersetError(
				"organizationId is required. Set SUPERSET_ORGANIZATION_ID, or pass `organizationId` to the Superset constructor.",
			);
		}
		return this._client.organizationId;
	}
}

export interface TerminalCreateParams {
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID to create the terminal in. */
	workspaceId: string;
	/** Shell command to run. Omit to open an interactive shell. */
	command?: string;
	/** Working directory for the terminal (defaults to the worktree). */
	cwd?: string;
}

export interface TerminalCreateResult {
	terminalId: string;
	status: string;
}

export declare namespace Terminals {
	export type { TerminalCreateParams, TerminalCreateResult };
}
