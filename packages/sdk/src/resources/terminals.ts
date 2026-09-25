import type { APIPromise } from "../core/api-promise";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/**
 * Terminals are PTY sessions inside a cloud workspace's sandbox. The
 * workspace must be `ready` (see `workspaces.retrieve`).
 */
export class Terminals extends APIResource {
	/**
	 * Create a terminal session in a cloud workspace, optionally running
	 * `command`.
	 */
	create(
		params: TerminalCreateParams,
		options?: RequestOptions,
	): APIPromise<TerminalCreateResult> {
		return this._client.workspaceMutation<TerminalCreateResult>(
			params.workspaceId,
			{ method: "terminals.create", procedure: "terminal.createSession" },
			{
				workspaceId: params.workspaceId,
				initialCommand: params.command,
				cwd: params.cwd,
			},
			options,
		);
	}

	/** List the live terminal sessions in a cloud workspace. */
	list(
		params: TerminalListParams,
		options?: RequestOptions,
	): APIPromise<TerminalListResult> {
		return this._client.workspaceQuery<TerminalListResult>(
			params.workspaceId,
			{ method: "terminals.list", procedure: "terminal.list" },
			{ workspaceId: params.workspaceId },
			options,
		);
	}

	/**
	 * Send a follow-up message into an already-running terminal (e.g. a
	 * claude/codex agent) instead of spawning a new session. Multi-line text
	 * is framed as a bracketed paste so it lands as one prompt.
	 */
	send(
		params: TerminalSendParams,
		options?: RequestOptions,
	): APIPromise<TerminalSendResult> {
		return this._client.workspaceMutation<TerminalSendResult>(
			params.workspaceId,
			{ method: "terminals.send", procedure: "terminal.send" },
			{
				terminalId: params.terminalId,
				workspaceId: params.workspaceId,
				text: params.text,
				submit: params.submit ?? true,
			},
			options,
		);
	}

	/**
	 * Read a terminal's current screen (and recent scrollback) back as plain
	 * text — for a TUI agent this is the agent's rendered output.
	 */
	read(
		params: TerminalReadParams,
		options?: RequestOptions,
	): APIPromise<TerminalReadResult> {
		return this._client.workspaceQuery<TerminalReadResult>(
			params.workspaceId,
			{ method: "terminals.read", procedure: "terminal.snapshot" },
			{
				terminalId: params.terminalId,
				workspaceId: params.workspaceId,
				maxLines: params.maxLines,
			},
			options,
		);
	}

	/** Close (dispose) a terminal — kills the PTY and the agent running in it. */
	close(
		params: TerminalCloseParams,
		options?: RequestOptions,
	): APIPromise<TerminalCloseResult> {
		return this._client.workspaceMutation<TerminalCloseResult>(
			params.workspaceId,
			{ method: "terminals.close", procedure: "terminal.killSession" },
			{ terminalId: params.terminalId, workspaceId: params.workspaceId },
			options,
		);
	}
}

export interface TerminalCreateParams {
	/** Cloud workspace id to create the terminal in. */
	workspaceId: string;
	/** Shell command to run. Omit to open an interactive shell. */
	command?: string;
	/** Working directory for the terminal (defaults to the workspace checkout). */
	cwd?: string;
}

export interface TerminalCreateResult {
	terminalId: string;
	status: string;
}

export interface TerminalListParams {
	/** Cloud workspace id whose terminals to list. */
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
	/** Cloud workspace id the terminal runs in. */
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
	/** Cloud workspace id the terminal runs in. */
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
	/** Cloud workspace id the terminal runs in. */
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
