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
				attachmentIds: params.attachmentIds,
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
	/** Agent preset id (e.g. `"claude"`, `"superset"`) or HostAgentConfig instance UUID. */
	agent: string;
	/** Prompt sent to the agent. */
	prompt: string;
	/** Host-scoped attachment ids; host resolves to absolute paths in the prompt. */
	attachmentIds?: string[];
}

export type AgentCreateResult =
	| { kind: "terminal"; sessionId: string; label: string }
	| { kind: "chat"; sessionId: string; label: string };

export declare namespace Agents {
	export type {
		HostAgentConfig,
		AgentListResponse,
		AgentListParams,
		AgentCreateParams,
		AgentCreateResult,
		PromptTransport,
	};
}
