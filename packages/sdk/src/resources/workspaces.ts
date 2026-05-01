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
	 * Create a workspace on a specific host. The host service must be running
	 * and reachable via the relay tunnel — the SDK is always remote, so this
	 * always goes through the relay (the CLI may shortcut for local hosts; the
	 * SDK never can).
	 *
	 * Mirrors `superset workspaces create`.
	 */
	create(
		params: WorkspaceCreateParams,
		options?: RequestOptions,
	): APIPromise<HostWorkspace> {
		return this._client.hostMutation<HostWorkspace>(
			params.hostId,
			"workspace.create",
			{
				projectId: params.projectId,
				name: params.name,
				branch: params.branch,
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
	/** Git branch to check out / create. */
	branch: string;
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
		WorkspaceDeleteResult,
	};
}
