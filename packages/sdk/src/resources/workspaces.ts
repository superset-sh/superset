import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/** Workspace row as served by the owning host's `workspace.list`. */
export interface HostWorkspaceRow {
	id: string;
	organizationId: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	/** Host-served project name; null for an orphaned projectId or a session. */
	projectName: string | null;
	hostId: string;
	name: string;
	branch: string;
	type: "main" | "worktree" | "session";
	createdByUserId: string | null;
	taskId: string | null;
	createdAt: Date;
	updatedAt: Date;
	/** Absolute worktree path on the host filesystem. */
	worktreePath: string;
	worktreeExists: boolean;
	/** Tags that file the workspace into sidebar folders. Empty on hosts that predate tags. */
	tags: string[];
	archivedAt: Date | null;
	archiveReason: string | null;
}

/** Tags compare trimmed and lower-cased, the way the host stores them. */
function normalizeTag(tag: string | undefined): string | null {
	if (tag === undefined) return null;
	const normalized = tag.trim().toLowerCase();
	return normalized.length === 0 || normalized.length > 64 ? null : normalized;
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
		const rows = await this._client.hostQuery<
			Array<Omit<HostWorkspaceRow, "tags"> & { tags?: string[] }>
		>(params.hostId, { method: "workspaces.list", procedure: "workspace.list" });
		const search = params.search?.toLowerCase();
		const projectName = params.projectName?.toLowerCase();
		const tag = normalizeTag(params.tag);
		if (params.tag !== undefined && tag === null) {
			throw new SupersetError("tag must be 1-64 characters after trimming");
		}
		return rows
			.map((row) => ({ ...row, tags: row.tags ?? [] }))
			.filter(
				(workspace) =>
					!params.projectId || workspace.projectId === params.projectId,
			)
			.filter(
				(workspace) =>
					!projectName ||
					workspace.projectName?.toLowerCase() === projectName,
			)
			.filter(
				(workspace) =>
					!search ||
					workspace.name.toLowerCase().includes(search) ||
					workspace.branch.toLowerCase().includes(search),
			)
			.filter((workspace) => tag === null || workspace.tags.includes(tag));
	}

	/**
	 * Look up one workspace by id on a host. Returns `null` when the host has
	 * no workspace with that id, like `tasks.retrieve`.
	 *
	 * Mirrors `superset workspaces get <id> --host <id>`.
	 */
	async retrieve(
		id: string,
		options: { hostId: string },
	): Promise<Workspace | null> {
		const workspaces = await this.list({ hostId: options.hostId });
		return workspaces.find((workspace) => workspace.id === id) ?? null;
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
			{ method: "workspaces.create", procedure: "workspaces.create" },
			{
				projectId: params.projectId,
				name: params.name,
				branch: params.branch,
				pr: params.pr,
				baseBranch: params.baseBranch,
				skipBranchPrefix: params.skipBranchPrefix,
				taskId: params.taskId,
				agents: params.agents,
				command: params.command,
				tags: params.tags,
			},
			options,
		);
	}

	/**
	 * Create a project-less "session" workspace on a host — a managed scratch
	 * folder (its own git repo) with no project, branch, or PR semantics.
	 *
	 * Mirrors `superset workspaces create` without `--project`.
	 */
	createSession(
		params: WorkspaceCreateSessionParams,
		options?: RequestOptions,
	): APIPromise<WorkspaceCreateSessionResult> {
		return this._client.hostMutation<WorkspaceCreateSessionResult>(
			params.hostId,
			{ method: "workspaces.createSession", procedure: "workspaces.createSession" },
			{
				name: params.name,
				agents: params.agents,
				command: params.command,
			},
			options,
		);
	}

	/**
	 * Update fields on a workspace. At least one field is required. Exposes
	 * `name`, `taskId`, and `tags`; branch and host moves require host-side
	 * orchestration and aren't safe to set directly. Pass `taskId: null` to
	 * unlink the workspace from its current task. `tags` replaces the whole
	 * set; pass `[]` to clear every tag.
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
			{ method: "workspaces.update", procedure: "workspace.update" },
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
			{ method: "workspaces.delete", procedure: "workspace.delete" },
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
	/** Restrict the listing to a single project by its host-served name (case-insensitive). */
	projectName?: string;
	/** Substring match against workspace name or branch. */
	search?: string;
	/** Only workspaces carrying this tag (case-insensitive). */
	tag?: string;
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
	/** Use `branch` exactly as given instead of namespacing it under the project's branch prefix. */
	skipBranchPrefix?: boolean;
	/** Optional Superset task id to link to the new workspace. */
	taskId?: string;
	/** Spawn one or more agents in the workspace immediately after creation. */
	agents?: WorkspaceAgentLaunch[];
	/** Shell command to run in the new worktree after creation. */
	command?: string;
	/** Tags to file the workspace under; each tag becomes a sidebar folder of the same name. */
	tags?: string[];
}

export interface WorkspaceAgentLaunch {
	/** Agent preset id (e.g. `"claude"`) or HostAgentConfig instance id. */
	agent: string;
	/** What to tell the agent. */
	prompt: string;
	/** Reasoning effort for this launch. Supported values depend on the agent; omit to use its default. */
	effort?: string;
	/** Host-scoped attachment ids; host resolves to absolute paths in the prompt. */
	attachmentIds?: string[];
}

export type WorkspaceCreateAgentResult =
	| { ok: true; kind: "terminal"; sessionId: string; label: string }
	| { ok: false; error: string };

export interface WorkspaceCreateResult {
	workspace: {
		id: string;
		organizationId: string;
		/** Null for project-less "session" workspaces. */
		projectId: string | null;
		hostId: string;
		name: string;
		branch: string;
		type: "main" | "worktree" | "session";
		createdByUserId: string | null;
		taskId: string | null;
		createdAt: Date;
		updatedAt: Date;
	};
	terminals: Array<{ terminalId: string; label?: string }>;
	agents: WorkspaceCreateAgentResult[];
	alreadyExists: boolean;
}

export interface WorkspaceCreateSessionParams {
	/** The host machineId to create the session on (see `hosts.list()`). */
	hostId: string;
	/** Display name; omit to get a friendly generated one. */
	name?: string;
	/** Agents to spawn in the session immediately after creation. */
	agents?: WorkspaceAgentLaunch[];
	/** Shell command to run in the session folder after creation. */
	command?: string;
}

export type WorkspaceCreateSessionResult = Omit<
	WorkspaceCreateResult,
	"alreadyExists"
>;

export interface WorkspaceUpdateParams {
	/** New workspace name. */
	name?: string;
	/** Link the workspace to a task by id, or pass `null` to unlink. */
	taskId?: string | null;
	/** Full replacement of the workspace's tag set; `[]` clears every tag. */
	tags?: string[];
}

export interface WorkspaceUpdateResult {
	id: string;
	name: string;
	branch: string;
	organizationId: string;
	/** Null for project-less "session" workspaces. */
	projectId: string | null;
	hostId: string;
	type: "main" | "worktree" | "session";
	createdByUserId: string | null;
	taskId: string | null;
	tags: string[];
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
		WorkspaceCreateSessionParams,
		WorkspaceCreateSessionResult,
		WorkspaceUpdateParams,
		WorkspaceUpdateResult,
		WorkspaceDeleteResult,
	};
}
