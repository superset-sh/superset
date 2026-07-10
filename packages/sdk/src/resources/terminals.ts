import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import { findWorkspaceHostId } from "./host-workspaces";

/**
 * Terminals are PTY sessions that live on a developer's host service, scoped
 * to a workspace. Creating one is routed to the workspace's host through the
 * relay tunnel.
 */
export class Terminals extends APIResource {
	/**
	 * Create a terminal session in an existing workspace. Looks up the host
	 * that owns the workspace (by fanning out across reachable hosts) and
	 * opens a fresh PTY on that host, optionally running `command`. Pass an
	 * explicit `hostId` to skip the lookup.
	 */
	async create(
		params: TerminalCreateParams,
		options?: { hostId?: string },
	): Promise<TerminalCreateResult> {
		const hostId =
			options?.hostId ??
			(await findWorkspaceHostId(
				this._client,
				this._requireOrgId(),
				params.workspaceId,
			));
		return this._client.hostMutation<TerminalCreateResult>(
			hostId,
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
