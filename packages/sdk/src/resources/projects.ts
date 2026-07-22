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
			"project.list",
			undefined,
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

export declare namespace Projects {
	export type { Project, ProjectListParams, ProjectListResponse };
}
