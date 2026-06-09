import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";

/**
 * Terminals are PTY sessions that live on a developer's host service, scoped
 * to a workspace. Creating one is routed to the workspace's host through the
 * relay tunnel.
 */
export class Terminals extends APIResource {
	/**
	 * Create a terminal session in an existing workspace. Looks up the host
	 * that owns the workspace (cloud index) and opens a fresh PTY on that host,
	 * optionally running `command`. Pass an explicit `hostId` to skip the
	 * lookup.
	 */
	async create(
		params: TerminalCreateParams,
		options?: { hostId?: string },
	): Promise<TerminalCreateResult> {
		this._requireOrgId();
		let hostId = options?.hostId;
		if (!hostId) {
			const cloud = await this._client.query<HostLookup | null>(
				"v2Workspace.getFromHost",
				{
					organizationId: this._client.organizationId,
					id: params.workspaceId,
				},
			);
			if (!cloud) {
				throw new SupersetError(`Workspace not found: ${params.workspaceId}`);
			}
			hostId = cloud.hostId;
		}
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

interface HostLookup {
	hostId: string;
}

export interface TerminalCreateResult {
	terminalId: string;
	status: string;
}

export declare namespace Terminals {
	export type { TerminalCreateParams, TerminalCreateResult };
}
