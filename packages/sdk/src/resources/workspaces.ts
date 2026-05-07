import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

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
	 * agents inside it as soon as the worktree is ready (the `agents` sugar
	 * runs `agents.run` once per entry against the freshly-created workspace).
	 *
	 * The host service must be running and reachable via the relay tunnel.
	 * Provide exactly one of `branch` or `pr`.
	 */
	create(
		params: WorkspaceCreateParams,
		options?: RequestOptions,
	): APIPromise<WorkspaceCreateResult> {
		return this._client.hostMutation<WorkspaceCreateResult>(
			params.hostId,
			"workspaces.create",
			{
				projectId: params.projectId,
				name: params.name,
				branch: params.branch,
				pr: params.pr,
				baseBranch: params.baseBranch,
				taskId: params.taskId,
				agents: params.agents,
			},
			options,
		);
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
	/** Git branch the workspace tracks. Required unless `pr` is set. */
	branch?: string;
	/** Pull request number — server runs `gh pr checkout` and derives the branch. */
	pr?: number;
	/** Branch to fork from when `branch` does not exist. Ignored with `pr`. */
	baseBranch?: string;
	/** Optional Superset task id to link to the new workspace. */
	taskId?: string;
	/** Spawn one or more agents in the workspace immediately after creation. */
	agents?: WorkspaceAgentLaunch[];
}

export interface WorkspaceAgentLaunch {
	/** Agent preset id (e.g. `"claude"`, `"superset"`) or HostAgentConfig instance id. */
	agent: string;
	/** What to tell the agent. */
	prompt: string;
	/** Host-scoped attachment ids; host resolves to absolute paths in the prompt. */
	attachmentIds?: string[];
}

export type WorkspaceCreateAgentResult =
	| { ok: true; kind: "terminal"; sessionId: string; label: string }
	| { ok: true; kind: "chat"; sessionId: string; label: string }
	| { ok: false; error: string };

export interface WorkspaceCreateResult {
	workspace: {
		id: string;
		organizationId: string;
		projectId: string;
		hostId: string;
		name: string;
		branch: string;
		type: "main" | "worktree";
		createdByUserId: string | null;
		taskId: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: WorkspaceCreateAgentResult[];
	alreadyExists: boolean;
}

export interface WorkspaceDeleteResult {
	[key: string]: unknown;
}

export declare namespace Workspaces {
	export type {
		Workspace,
		HostWorkspace,
		WorkspaceListResponse,
		WorkspaceListParams,
		WorkspaceCreateParams,
		WorkspaceAgentLaunch,
		WorkspaceCreateAgentResult,
		WorkspaceCreateResult,
		WorkspaceDeleteResult,
	};
}
