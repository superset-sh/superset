import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/** Workspace row as served by the owning host's `workspace.list`. */
export interface HostWorkspaceRow {
	id: string;
	organizationId: string;
	projectId: string;
	/** Host-served project name; null for an orphaned projectId. */
	projectName: string | null;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	/** Absolute worktree path on the host filesystem. */
	worktreePath: string;
	worktreeExists: boolean;
}

/**
 * Workspaces are physical artifacts (git worktrees / clones) on a developer's
 * machine. Their records are host-owned: every operation targets one host
 * (`hostId`, see `hosts.list()`) — there is no org-wide search.
 *
 * Mirrors the CLI's `superset workspaces …` commands.
 */
export class Workspaces extends APIResource {
	/**
	 * List workspaces on a host.
	 *
	 * Mirrors `superset workspaces list --host <id>`.
	 */
	async list(params: WorkspaceListParams): Promise<WorkspaceListResponse> {
		this._requireOrgId();
		const workspaces = await this._client.hostQuery<HostWorkspaceRow[]>(
			params.hostId,
			"workspace.list",
		);
		const search = params.search?.toLowerCase();
		return workspaces
			.filter(
				(workspace) =>
					!params.projectId || workspace.projectId === params.projectId,
			)
			.filter(
				(workspace) =>
					!search ||
					workspace.name.toLowerCase().includes(search) ||
					workspace.branch.toLowerCase().includes(search),
			);
	}

	/**
	 * Create a workspace on a specific host. Optionally spawn one or more
	 * agents inside it as soon as the worktree is ready (the `agents` sugar
	 * runs `agents.create` once per entry against the freshly-created workspace),
	 * and/or run a one-off shell `command` in the worktree.
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
				command: params.command,
			},
			options,
		);
	}

	/**
	 * Update fields on a workspace. At least one field is required. Currently
	 * exposes `name` and `taskId`; branch and host moves require host-side
	 * orchestration and aren't safe to set directly. Pass `taskId: null` to
	 * unlink the workspace from its current task.
	 *
	 * Mirrors `superset workspaces update --host <id>`.
	 */
	async update(
		id: string,
		params: WorkspaceUpdateParams,
		options: { hostId: string },
	): Promise<WorkspaceUpdateResult> {
		this._requireOrgId();
		return this._client.hostMutation<WorkspaceUpdateResult>(
			options.hostId,
			"workspace.update",
			{ id, ...params },
		);
	}

	/**
	 * Delete a workspace by id on its host.
	 *
	 * Mirrors `superset workspaces delete --host <id>`.
	 */
	async delete(
		id: string,
		options: { hostId: string },
	): Promise<WorkspaceDeleteResult> {
		this._requireOrgId();
		return this._client.hostMutation<WorkspaceDeleteResult>(
			options.hostId,
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

/** Workspace row as served by the owning host's `workspace.list`. */
export type Workspace = HostWorkspaceRow;

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

export type WorkspaceListResponse = Array<Workspace>;

export interface WorkspaceListParams {
	/** The host machineId to list (see `hosts.list()`). */
	hostId: string;
	/** Restrict the listing to a single project by UUID. */
	projectId?: string;
	/** Substring match against workspace name or branch. */
	search?: string;
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
	/** Pull request number — server checks out the verified PR head and derives the branch. */
	pr?: number;
	/** Branch to fork from when `branch` does not exist. Ignored with `pr`. */
	baseBranch?: string;
	/** Optional Superset task id to link to the new workspace. */
	taskId?: string;
	/** Spawn one or more agents in the workspace immediately after creation. */
	agents?: WorkspaceAgentLaunch[];
	/** Shell command to run in the new worktree after creation. */
	command?: string;
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

export interface WorkspaceUpdateParams {
	/** New workspace name. */
	name?: string;
	/** Link the workspace to a task by id, or pass `null` to unlink. */
	taskId?: string | null;
}

export interface WorkspaceUpdateResult {
	id: string;
	name: string;
	branch: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	type: "main" | "worktree";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface WorkspaceDeleteResult {
	success: boolean;
	cloudDeleted?: boolean;
	worktreeRemoved?: boolean;
	branchDeleted?: boolean;
	warnings?: string[];
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
		WorkspaceUpdateParams,
		WorkspaceUpdateResult,
		WorkspaceDeleteResult,
	};
}
