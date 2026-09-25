import type { APIPromise } from "../core/api-promise";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/**
 * Agents run in terminal sessions inside a cloud workspace's sandbox. The
 * workspace must be `ready` (see `workspaces.retrieve`).
 *
 * Mirrors the CLI's `superset agents create`.
 */
export class Agents extends APIResource {
	/**
	 * Launch an agent session in a cloud workspace: starts the named built-in
	 * agent in a fresh terminal session there.
	 */
	create(
		params: AgentCreateParams,
		options?: RequestOptions,
	): APIPromise<AgentCreateResult> {
		return this._client.workspaceMutation<AgentCreateResult>(
			params.workspaceId,
			{ method: "agents.create", procedure: "agents.run" },
			{
				workspaceId: params.workspaceId,
				agent: params.agent,
				prompt: params.prompt,
				resumeSessionId: params.resumeSessionId,
				model: params.model,
				effort: params.effort,
			},
			options,
		);
	}
}

export interface AgentCreateParams {
	/** Cloud workspace id to launch the agent session in. */
	workspaceId: string;
	/** Built-in agent id installed in the sandbox (e.g. `"claude"` or `"codex"`). */
	agent: string;
	/** Prompt sent to the agent. Optional when `resumeSessionId` is provided. */
	prompt?: string;
	/** Session id of a previous run of this agent to restore instead of starting fresh (e.g. `claude --resume <id>`). */
	resumeSessionId?: string;
	/** Model for this launch. Supported values depend on the agent; omit to use its default. */
	model?: string;
	/** Reasoning effort for this launch. Supported values depend on the agent; omit to use its default. */
	effort?: string;
}

export type AgentCreateResult = {
	kind: "terminal";
	sessionId: string;
	label: string;
};

export declare namespace Agents {
	export type { AgentCreateParams, AgentCreateResult };
}
