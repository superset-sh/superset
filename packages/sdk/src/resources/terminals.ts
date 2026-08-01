import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";

/**
 * Terminals are PTY sessions that live on a developer's host service, scoped
 * to a workspace. Every operation is routed to the workspace's host through
 * the relay tunnel.
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

	/** List the live terminal sessions in a workspace. */
	async list(params: TerminalListParams): Promise<TerminalListResult> {
		this._requireOrgId();
		return this._client.hostQuery<TerminalListResult>(
			params.hostId,
			"terminal.listSessions",
			{ workspaceId: params.workspaceId },
		);
	}

	/**
	 * Send a follow-up message into an already-running terminal (e.g. a
	 * claude/codex agent) instead of spawning a new session. The host frames
	 * multi-line text as a bracketed paste so it lands as one prompt.
	 */
	async send(params: TerminalSendParams): Promise<TerminalSendResult> {
		this._requireOrgId();
		return this._client.hostMutation<TerminalSendResult>(
			params.hostId,
			"terminal.send",
			{
				terminalId: params.terminalId,
				workspaceId: params.workspaceId,
				text: params.text,
				submit: params.submit ?? true,
			},
		);
	}

	/**
	 * Read a terminal's current screen (and recent scrollback) back as plain
	 * text — for a TUI agent this is the agent's rendered output.
	 */
	async read(params: TerminalReadParams): Promise<TerminalReadResult> {
		this._requireOrgId();
		return this._client.hostQuery<TerminalReadResult>(
			params.hostId,
			"terminal.snapshot",
			{
				terminalId: params.terminalId,
				workspaceId: params.workspaceId,
				maxLines: params.maxLines,
			},
		);
	}

	/** Close (dispose) a terminal — kills the PTY and the agent running in it. */
	async close(params: TerminalCloseParams): Promise<TerminalCloseResult> {
		this._requireOrgId();
		return this._client.hostMutation<TerminalCloseResult>(
			params.hostId,
			"terminal.killSession",
			{ terminalId: params.terminalId, workspaceId: params.workspaceId },
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

export interface TerminalListParams {
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID whose terminals to list. */
	workspaceId: string;
}

export interface TerminalSummary {
	terminalId: string;
	workspaceId: string;
	createdAt: number;
	exited: boolean;
	exitCode: number;
	attached: boolean;
	title: string | null;
}

export interface TerminalListResult {
	sessions: TerminalSummary[];
}

export interface TerminalSendParams {
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID the terminal runs in. */
	workspaceId: string;
	/** Terminal id (the `sessionId` `agents.create()` returned). */
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
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID the terminal runs in. */
	workspaceId: string;
	/** Terminal id (the `sessionId` `agents.create()` returned). */
	terminalId: string;
	/** Cap returned rows from the bottom. Omit for the full snapshot. */
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
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID the terminal runs in. */
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
		TerminalListResult,
		TerminalSummary,
		TerminalSendParams,
		TerminalSendResult,
		TerminalReadParams,
		TerminalReadResult,
		TerminalCloseParams,
		TerminalCloseResult,
	};
}
