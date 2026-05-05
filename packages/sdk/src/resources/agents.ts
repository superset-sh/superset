import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/**
 * Configured terminal-agent rows live on each developer's host service —
 * one row per installed agent in Settings → Agents on that machine. Reads
 * (`list`) and the launch action (`run`) are routed to a specific host
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
	 * Launch an agent inside an existing workspace. Looks up the host that
	 * owns the workspace (cloud index) and starts the named preset (or
	 * HostAgentConfig instance) in a fresh terminal session on that host.
	 * Pass an explicit `hostId` to skip the lookup.
	 *
	 * Mirrors `superset agents run`.
	 */
	async run(
		params: AgentRunParams,
		options?: { hostId?: string },
	): Promise<AgentRunResult> {
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
		return this._client.hostMutation<AgentRunResult>(hostId, "agents.run", {
			workspaceId: params.workspaceId,
			agent: params.agent,
			prompt: params.prompt,
			attachmentIds: params.attachmentIds,
		});
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

export interface AgentRunParams {
	/** Workspace UUID to run the agent in. */
	workspaceId: string;
	/** Agent preset id (e.g. `"claude"`) or HostAgentConfig instance UUID. */
	agent: string;
	/** Prompt sent to the agent. */
	prompt: string;
	/** Host-scoped attachment ids; host resolves to absolute paths in the prompt. */
	attachmentIds?: string[];
}

interface HostLookup {
	hostId: string;
}

export interface AgentRunResult {
	sessionId: string;
	label: string;
}

export declare namespace Agents {
	export type {
		HostAgentConfig,
		AgentListResponse,
		AgentListParams,
		AgentRunParams,
		AgentRunResult,
		PromptTransport,
	};
}
