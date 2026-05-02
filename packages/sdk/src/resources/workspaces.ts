import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";
import type {
	AgentConfig,
	Automation,
	AutomationRunDispatched,
} from "./automations";

/**
 * Workspaces are physical artifacts (git worktrees / clones) on a developer's
 * machine. Their lifecycle (create / delete) is managed by the host service
 * running on that machine, reached through the relay tunnel. The cloud API
 * holds the metadata index — used here for listing and to look up which host
 * a workspace lives on so we can route delete calls to it.
 *
 * Mirrors the CLI's `superset workspaces …` commands.
 */
export class Workspaces extends APIResource {
	/**
	 * List workspaces in the organization (cloud index). Optionally scope to a
	 * single host.
	 *
	 * Mirrors `superset workspaces list`.
	 */
	list(
		params?: WorkspaceListParams,
		options?: RequestOptions,
	): APIPromise<WorkspaceListResponse> {
		return this._client.query<WorkspaceListResponse>(
			"v2Workspace.list",
			{ organizationId: this._requireOrgId(), ...params },
			options,
		);
	}

	/**
	 * Create a workspace on a specific host. Optionally spawn one or more
	 * agents inside it as soon as the worktree is ready.
	 *
	 * The host service must be running and reachable via the relay tunnel.
	 * When `agents` is provided, the SDK creates a one-shot automation per
	 * agent (pinned to the new workspace + host) and dispatches them — the
	 * dispatched runs are returned alongside the workspace.
	 */
	async create(
		params: WorkspaceCreateParams,
		options?: RequestOptions,
	): Promise<CreatedWorkspace> {
		const ws = await this._client.hostMutation<HostWorkspace>(
			params.hostId,
			"workspace.create",
			{
				projectId: params.projectId,
				name: params.name,
				branch: params.branch,
			},
			options,
		);

		const agents = params.agents ?? [];
		if (agents.length === 0) {
			return { ...ws, agentRuns: [] };
		}

		const agentRuns: AutomationRunDispatched[] = [];
		for (let i = 0; i < agents.length; i++) {
			const spec = agents[i]!;
			const agentId = spec.agent ?? "claude";
			const agentConfig: AgentConfig =
				typeof spec.agentConfig === "object"
					? spec.agentConfig
					: { id: agentId, kind: "terminal", enabled: true };

			const automation = await this._client.mutation<Automation>(
				"automation.create",
				{
					name: `${params.name} (${agentId}${agents.length > 1 ? ` #${i + 1}` : ""})`,
					prompt: spec.prompt,
					agentConfig,
					targetHostId: params.hostId,
					v2WorkspaceId: ws.id,
					// Yearly schedule = effectively one-shot. The automation row
					// stays in the DB after dispatch — clean it up out-of-band if
					// it bothers you.
					rrule: "FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=31",
					timezone: "UTC",
					mcpScope: spec.mcpScope ?? [],
				},
				options,
			);
			const run = await this._client.mutation<AutomationRunDispatched>(
				"automation.runNow",
				{ id: automation.id },
				options,
			);
			agentRuns.push(run);
		}

		return { ...ws, agentRuns };
	}

	/**
	 * Delete a workspace by id. Looks up the host the workspace lives on (via
	 * the cloud index) and routes the delete to that host's service through
	 * the relay. Pass an explicit `hostId` to skip the lookup.
	 *
	 * Mirrors `superset workspaces delete`.
	 */
	async delete(
		id: string,
		options?: { hostId?: string },
	): Promise<WorkspaceDeleteResult> {
		let hostId = options?.hostId;
		if (!hostId) {
			const cloud = await this._client.query<HostLookup | null>(
				"v2Workspace.getFromHost",
				{ organizationId: this._requireOrgId(), id },
			);
			if (!cloud) throw new SupersetError(`Workspace not found: ${id}`);
			hostId = cloud.hostId;
		}
		return this._client.hostMutation<WorkspaceDeleteResult>(
			hostId,
			"workspace.delete",
			{ id },
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

/** Cloud-index workspace row (from the API). */
export interface Workspace {
	id: string;
	name: string;
	branch: string;
	projectId: string;
	projectName: string;
	hostId: string;
}

/** Workspace as returned by the host service (slightly different fields). */
export interface HostWorkspace {
	id: string;
	name: string;
	branch: string;
	projectId: string;
	/** Absolute path on the host filesystem. */
	path?: string;
	type?: "main" | "worktree";
}

interface HostLookup {
	hostId: string;
}

export type WorkspaceListResponse = Array<Workspace>;

export interface WorkspaceListParams {
	/** Restrict the listing to workspaces on a single host machineId. */
	hostId?: string;
}

export interface WorkspaceCreateParams {
	/** The host machineId to create the workspace on (see `hosts.list()`). */
	hostId: string;
	/** Project UUID (see `projects.list()`). */
	projectId: string;
	/** Workspace name. */
	name: string;
	/** Git branch to check out / create. */
	branch: string;
	/** Spawn one or more agents in the workspace immediately after creation. */
	agents?: WorkspaceAgentSpawn[];
}

export interface WorkspaceAgentSpawn {
	/** What to tell the agent. */
	prompt: string;
	/** Agent preset id. Defaults to `"claude"`. */
	agent?: string;
	/** Full agent config; overrides `agent` if provided. */
	agentConfig?: AgentConfig;
	/** MCP servers this dispatch is allowed to use. */
	mcpScope?: string[];
}

export interface CreatedWorkspace extends HostWorkspace {
	/** Dispatched runs, one per `agents[]` entry. Empty if no agents were spawned. */
	agentRuns: AutomationRunDispatched[];
}

export interface WorkspaceDeleteResult {
	/** Host-service delete returns its own shape; surfaced here as-is. */
	[key: string]: unknown;
}

export declare namespace Workspaces {
	export type {
		Workspace,
		HostWorkspace,
		WorkspaceListResponse,
		WorkspaceListParams,
		WorkspaceCreateParams,
		WorkspaceAgentSpawn,
		CreatedWorkspace,
		WorkspaceDeleteResult,
	};
}
