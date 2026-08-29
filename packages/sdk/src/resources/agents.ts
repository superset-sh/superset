import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/**
 * Configured terminal-agent rows live on each developer's host service —
 * one row per installed agent in Settings → Agents on that machine. Reads
 * (`list`) and the launch action (`create`) are routed to a specific host
 * through the relay tunnel.
 *
 * Mirrors the CLI's `superset agents …` commands.
 */
export class Agents extends APIResource {
	/**
	 * List agents configured on a host — the rows that drive the agent picker
	 * inside workspaces, in persisted display order. Includes user edits to
	 * label/command/args/env. First call on a fresh host seeds bundled
	 * defaults.
	 *
	 * Mirrors `superset agents list --host <id>`.
	 */
	list(params: AgentListParams, options?: RequestOptions) {
		this._requireOrgId();
		return this._client.hostQuery<AgentListResponse>(
			params.hostId,
			"settings.agentConfigs.list",
			undefined,
			options,
		);
	}

	/**
	 * Create (launch) an agent session inside an existing workspace on its
	 * host: starts the named preset (or HostAgentConfig instance) in a fresh
	 * terminal session there.
	 *
	 * Returns the Superset `terminalId`. The agent's own conversation id does
	 * not exist yet — the agent has to report it through a lifecycle hook —
	 * so `agent.state` is `"starting"` here and {@link Agents.get} is the
	 * source of truth from then on.
	 *
	 * Mirrors `superset agents create --host <id>`.
	 */
	async create(params: AgentCreateParams): Promise<AgentCreateResult> {
		this._requireOrgId();
		return this._client.hostMutation<AgentCreateResult>(
			params.hostId,
			"agents.run",
			{
				workspaceId: params.workspaceId,
				agent: params.agent,
				prompt: params.prompt,
				resumeSessionId: params.resumeSessionId,
				effort: params.effort,
				attachmentIds: params.attachmentIds,
			},
		);
	}

	/**
	 * Read the agent session bound to a terminal — including one that has
	 * already ended, whether the agent quit or its terminal died under it.
	 *
	 * This is how you recover `agent.sessionId`, the provider's own opaque
	 * conversation id, to hand back to {@link Agents.create} as
	 * `resumeSessionId` later. Never parse a provider's session files for it.
	 *
	 * Mirrors `superset agents get --host <id>`.
	 */
	async get(params: AgentGetParams): Promise<AgentGetResult> {
		this._requireOrgId();
		return this._client.hostQuery<AgentGetResult>(
			params.hostId,
			"terminalAgents.get",
			{
				workspaceId: params.workspaceId,
				terminalId: params.terminalId,
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

export type PromptTransport = "argv" | "stdin";

/** A configured terminal-agent row on a host (from `list`). */
export interface HostAgentConfig {
	id: string;
	presetId: string;
	label: string;
	command: string;
	args: string[];
	promptTransport: PromptTransport;
	promptArgs: string[];
	/** Args that resume a previous session by id; empty when the agent has no id-based resume. */
	resumeArgs: string[];
	env: Record<string, string>;
	order: number;
}

export type AgentListResponse = Array<HostAgentConfig>;

export interface AgentListParams {
	/** Host machineId to query (see `hosts.list()`). */
	hostId: string;
}

export interface AgentCreateParams {
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID to launch the agent session in. */
	workspaceId: string;
	/** Agent preset id (e.g. `"claude"`) or HostAgentConfig instance UUID. */
	agent: string;
	/** Prompt sent to the agent. Optional when `resumeSessionId` is provided. */
	prompt?: string;
	/** Session id of a previous run of this agent to restore instead of starting fresh (e.g. `claude --resume <id>`). */
	resumeSessionId?: string;
	/** Reasoning effort for this launch. Supported values depend on the agent; omit to use its default. */
	effort?: string;
	/** Host-scoped attachment ids; host resolves to absolute paths in the prompt. */
	attachmentIds?: string[];
}

export type AgentCreateResult = {
	kind: "terminal";
	/** The PTY this launch created. No provider accepts it for resume. */
	terminalId: string;
	/**
	 * @deprecated Alias of `terminalId`. It has never been the provider's
	 * conversation id — read `agent.sessionId` from {@link Agents.get}.
	 */
	sessionId: string;
	label: string;
	/** Identity as far as it is knowable at launch: `state: "starting"`. */
	agent: AgentSessionIdentity;
};

/**
 * What an agent conversation is doing, independent of its provider and of
 * whether its terminal is still open. `ended` covers both a clean goodbye
 * and a terminal that died under the agent — in neither case is the agent
 * working, even when the shell is still open.
 */
export type AgentSessionState =
	| "starting"
	| "working"
	| "awaiting-input"
	| "idle"
	| "failed"
	| "ended";

/** The provider-neutral agent identity carried by `create` and `get`. */
export interface AgentSessionIdentity {
	/** Which agent must resume this session (`claude`, `codex`, …). */
	presetId: string | null;
	/** The provider's opaque conversation id, passed through untouched. */
	sessionId: string | null;
	/**
	 * Whether `sessionId` can be handed back as `resumeSessionId`. False when
	 * the agent has no id-based resume, or no conversation was persisted.
	 * Ending does not clear it — parking and resuming later is the point.
	 */
	resumable: boolean;
	state: AgentSessionState;
	lastEventType: string | null;
	/** ISO 8601. */
	lastEventAt: string | null;
	/** ISO 8601. */
	startedAt: string | null;
	ended: boolean;
	/** ISO 8601. */
	endedAt: string | null;
	/** Why it ended, e.g. `detached`, `terminal-exited`, `disposed`. */
	endReason: string | null;
}

export interface AgentGetParams {
	/** The host machineId the workspace lives on (see `hosts.list()`). */
	hostId: string;
	/** Workspace UUID the terminal belongs to. */
	workspaceId: string;
	/** Superset terminal id, e.g. `terminalId` from `create()`. */
	terminalId: string;
}

export type AgentGetResult = {
	kind: "terminal";
	terminalId: string;
	workspaceId: string;
	/** The PTY's own state (`active`, `exited`, `disposed`), not the agent's. */
	terminalStatus: string | null;
	/** Null when no agent has ever bound to this terminal. */
	agent: AgentSessionIdentity | null;
};

export declare namespace Agents {
	export type {
		HostAgentConfig,
		AgentListResponse,
		AgentListParams,
		AgentCreateParams,
		AgentCreateResult,
		AgentGetParams,
		AgentGetResult,
		AgentSessionIdentity,
		AgentSessionState,
		PromptTransport,
	};
}
