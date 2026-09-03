import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/**
 * Projects are host-owned: each host service serves the projects set up on
 * that machine. There is no org-wide project registry.
 */
export class Projects extends APIResource {
	/**
	 * List projects set up on a host.
	 *
	 * Mirrors `superset projects list --host <id>`.
	 */
	list(
		params: ProjectListParams,
		options?: RequestOptions,
	): APIPromise<ProjectListResponse> {
		this._requireOrgId();
		return this._client.hostQuery<ProjectListResponse>(
			params.hostId,
			{ method: "projects.list", procedure: "project.list" },
			undefined,
			options,
		);
	}

	/**
	 * Create a project on a host: clone a git remote into `parentDir`, or
	 * register an existing local checkout at `import`. Exactly one of `clone`
	 * or `import` is required.
	 *
	 * Mirrors `superset projects create --host <id>`.
	 */
	create(
		params: ProjectCreateParams,
		options?: RequestOptions,
	): APIPromise<ProjectCreateResult> {
		this._requireOrgId();
		if (Boolean(params.clone) === Boolean(params.import)) {
			throw new SupersetError("Specify exactly one of `clone` or `import`");
		}
		if (params.clone && !params.parentDir) {
			throw new SupersetError("`clone` requires `parentDir`");
		}
		if (params.import && params.parentDir) {
			throw new SupersetError(
				"`parentDir` cannot be combined with `import`; `import` takes the full repo path",
			);
		}
		const mode = params.clone
			? {
					kind: "clone" as const,
					parentDir: params.parentDir as string,
					url: params.clone,
				}
			: { kind: "importLocal" as const, repoPath: params.import as string };
		return this._client.hostMutation<ProjectCreateResult>(
			params.hostId,
			{ method: "projects.create", procedure: "project.create" },
			{ name: params.name, mode },
			options,
		);
	}

	/**
	 * Adopt a project that already exists in the organization onto a host:
	 * clone its repo into `parentDir`, or register an existing checkout at
	 * `path`. Exactly one of `parentDir` or `path` is required. A host that
	 * has never seen the project needs `repoUrl` (and optionally `name`) so it
	 * knows what to set up.
	 *
	 * Mirrors `superset projects setup <id> --host <id>`.
	 */
	setup(
		params: ProjectSetupParams,
		options?: RequestOptions,
	): APIPromise<ProjectSetupResult> {
		this._requireOrgId();
		if (Boolean(params.parentDir) === Boolean(params.path)) {
			throw new SupersetError("Specify exactly one of `parentDir` or `path`");
		}
		if (params.allowRelocate && !params.path) {
			throw new SupersetError("`allowRelocate` only applies to `path`");
		}
		const mode = params.parentDir
			? { kind: "clone" as const, parentDir: params.parentDir }
			: {
					kind: "import" as const,
					repoPath: params.path as string,
					allowRelocate: params.allowRelocate ?? false,
				};
		const origin =
			params.repoUrl || params.name
				? { repoCloneUrl: params.repoUrl ?? null, name: params.name }
				: undefined;
		return this._client.hostMutation<ProjectSetupResult>(
			params.hostId,
			{ method: "projects.setup", procedure: "project.setup" },
			{ projectId: params.projectId, origin, mode },
			options,
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

/** Project row as served by a host's `project.list`. */
export interface Project {
	id: string;
	name: string;
	/** Absolute repo path on the host filesystem. */
	repoPath: string;
	repoOwner: string | null;
	repoName: string | null;
	repoUrl: string | null;
	worktreeBaseDir: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface ProjectListParams {
	/** The host machineId to list (see `hosts.list()`). */
	hostId: string;
}

export type ProjectListResponse = Array<Project>;

export interface ProjectCreateParams {
	/** The host machineId to create the project on (see `hosts.list()`). */
	hostId: string;
	/** Project name. */
	name: string;
	/** Git remote URL to clone (requires `parentDir`). Mutually exclusive with `import`. */
	clone?: string;
	/** Parent directory the cloned repo lands in (required with `clone`). */
	parentDir?: string;
	/** Existing local repo path on the host. Mutually exclusive with `clone`. */
	import?: string;
}

export interface ProjectCreateResult {
	projectId: string;
	/** Absolute repo path on the host filesystem. */
	repoPath: string;
	mainWorkspaceId: string;
	/** False when the host already had a project at that path and reused it. */
	created: boolean;
}

export interface ProjectSetupParams {
	/** The host machineId to set the project up on (see `hosts.list()`). */
	hostId: string;
	/** Project UUID to adopt. */
	projectId: string;
	/** Parent directory to clone the project's repo into (clone mode). */
	parentDir?: string;
	/** Existing local repo path on the host (import mode). */
	path?: string;
	/** Permit re-importing at a different path if the project is already set up on the host. */
	allowRelocate?: boolean;
	/** Repo clone URL, when the host doesn't know the project yet. */
	repoUrl?: string;
	/** Project name, when the host doesn't know it yet. */
	name?: string;
}

export interface ProjectSetupResult {
	/** Absolute repo path on the host filesystem. */
	repoPath: string;
	mainWorkspaceId: string | null;
}

export declare namespace Projects {
	export type {
		Project,
		ProjectListParams,
		ProjectListResponse,
		ProjectCreateParams,
		ProjectCreateResult,
		ProjectSetupParams,
		ProjectSetupResult,
	};
}
