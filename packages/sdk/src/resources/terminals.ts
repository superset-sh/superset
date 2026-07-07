import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";

/**
 * Terminals are PTY sessions that live on a developer's host service, scoped
 * to a workspace. Every operation resolves the workspace's host (cloud index)
 * and is routed to that host through the relay tunnel. Pass an explicit
 * `hostId` to skip the lookup.
 */
export class Terminals extends APIResource {
	/**
	 * Create a terminal session in an existing workspace and open a fresh PTY,
	 * optionally running `command`.
	 */
	async create(
		params: TerminalCreateParams,
		options?: { hostId?: string },
	): Promise<TerminalCreateResult> {
		const hostId = await this._hostFor(params.workspaceId, options?.hostId);
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

	/** List the live terminal sessions in a workspace. */
	async list(
		params: TerminalListParams,
		options?: { hostId?: string },
	): Promise<TerminalListResult> {
		const hostId = await this._hostFor(params.workspaceId, options?.hostId);
		return this._client.hostQuery<TerminalListResult>(
			hostId,
			"terminal.listSessions",
			{ workspaceId: params.workspaceId },
		);
	}

	/**
	 * Send a follow-up message into an already-running terminal (e.g. a
	 * claude/codex agent) instead of spawning a new session. The host frames
	 * multi-line text as a bracketed paste so it lands as one prompt.
	 */
	async send(
		params: TerminalSendParams,
		options?: { hostId?: string },
	): Promise<TerminalSendResult> {
		const hostId = await this._hostFor(params.workspaceId, options?.hostId);
		return this._client.hostMutation<TerminalSendResult>(hostId, "terminal.send", {
			terminalId: params.terminalId,
			text: params.text,
			submit: params.submit ?? true,
		});
	}

	/**
	 * Read a terminal's current screen (and recent scrollback) back as plain
	 * text — for a TUI agent this is the agent's rendered output.
	 */
	async read(
		params: TerminalReadParams,
		options?: { hostId?: string },
	): Promise<TerminalReadResult> {
		const hostId = await this._hostFor(params.workspaceId, options?.hostId);
		return this._client.hostQuery<TerminalReadResult>(hostId, "terminal.snapshot", {
			terminalId: params.terminalId,
			maxLines: params.maxLines,
		});
	}

	/** Close (dispose) a terminal — kills the PTY and the agent running in it. */
	async close(
		params: TerminalCloseParams,
		options?: { hostId?: string },
	): Promise<TerminalCloseResult> {
		const hostId = await this._hostFor(params.workspaceId, options?.hostId);
		return this._client.hostMutation<TerminalCloseResult>(
			hostId,
			"terminal.killSession",
			{ terminalId: params.terminalId, workspaceId: params.workspaceId },
		);
	}

	private async _hostFor(
		workspaceId: string,
		hostId?: string,
	): Promise<string> {
		this._requireOrgId();
		if (hostId) return hostId;
		const cloud = await this._client.query<HostLookup | null>(
			"v2Workspace.getFromHost",
			{ organizationId: this._client.organizationId, id: workspaceId },
		);
		if (!cloud) {
			throw new SupersetError(`Workspace not found: ${workspaceId}`);
		}
		return cloud.hostId;
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

export interface TerminalListParams {
	/** Workspace UUID whose terminals to list. */
	workspaceId: string;
}

export interface TerminalSummary {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	/** Whether a renderer is currently attached over the WebSocket. */
	attached: boolean;
	title: string | null;
}

export interface TerminalListResult {
	sessions: TerminalSummary[];
}

export interface TerminalSendParams {
	/** Workspace UUID the terminal runs in (routes to the owning host). */
	workspaceId: string;
	/** Terminal id (the value `agents.create` / `terminals.create` returned). */
	terminalId: string;
	/** Text to write into the terminal. */
	text: string;
	/** Press Enter after the text. Default true. */
	submit?: boolean;
}

export interface TerminalSendResult {
	terminalId: string;
	submitted: boolean;
}

export interface TerminalReadParams {
	/** Workspace UUID the terminal runs in (routes to the owning host). */
	workspaceId: string;
	/** Terminal id to read. */
	terminalId: string;
	/** Cap returned rows from the bottom. Default: the full snapshot. */
	maxLines?: number;
}

export interface TerminalReadResult {
	terminalId: string;
	cols: number;
	rows: number;
	/** Plain text of the terminal screen (alt-screen for TUI agents). */
	text: string;
}

export interface TerminalCloseParams {
	/** Workspace UUID the terminal runs in (routes to the owning host). */
	workspaceId: string;
	/** Terminal id to close. */
	terminalId: string;
}

export interface TerminalCloseResult {
	terminalId: string;
	status: string;
}

export declare namespace Terminals {
	export type {
		TerminalCreateParams,
		TerminalCreateResult,
		TerminalListParams,
		TerminalSummary,
		TerminalListResult,
		TerminalSendParams,
		TerminalSendResult,
		TerminalReadParams,
		TerminalReadResult,
		TerminalCloseParams,
		TerminalCloseResult,
	};
}
