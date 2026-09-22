import type { APIPromise } from "../core/api-promise";
import { SupersetError } from "../core/error";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

type EnvironmentListWire = {
	result: {
		data: {
			json: Array<{
				id: string;
				name: string;
				repositories: ReadonlyArray<unknown> | null;
			}>;
		};
	};
};

/**
 * Cloud workspaces are sandboxes Superset runs for the organization, each
 * started from an environment whose repositories are its checkouts. The API
 * owns their records; terminals and agents run inside them (see
 * `terminals` and `agents`).
 *
 * Mirrors the CLI's `superset workspaces …` commands.
 */
export class Workspaces extends APIResource {
	/**
	 * List the organization's cloud workspaces, newest first. Provisioning and
	 * failed workspaces are included; read `status`.
	 *
	 * Mirrors `superset workspaces list`.
	 */
	list(
		params?: WorkspaceListParams | null,
		options?: RequestOptions,
	): APIPromise<WorkspaceListResponse> {
		const search = params?.search?.toLowerCase();
		return this._client
			.query<WorkspaceListResponse>(
				{ method: "workspaces.list", procedure: "cloudWorkspace.list" },
				{ organizationId: this._requireOrgId() },
				options,
			)
			._thenUnwrap((workspaces) =>
				workspaces.filter(
					(workspace) =>
						!search ||
						workspace.name.toLowerCase().includes(search) ||
						workspace.branch.toLowerCase().includes(search),
				),
			);
	}

	/**
	 * Retrieve a cloud workspace by id. Returns `null` when the organization
	 * has no such workspace.
	 */
	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<CloudWorkspace | null> {
		return this._client
			.query<WorkspaceListResponse>(
				{ method: "workspaces.retrieve", procedure: "cloudWorkspace.list" },
				{ organizationId: this._requireOrgId() },
				options,
			)
			._thenUnwrap(
				(workspaces) =>
					workspaces.find((workspace) => workspace.id === id) ?? null,
			);
	}

	/**
	 * Create a cloud workspace. Provisioning runs in the background, so this
	 * returns the row in `provisioning`; poll `retrieve(id)` until `ready`
	 * before creating terminals or agents in it. Pass `agent` and `prompt` to
	 * launch an agent as soon as the sandbox boots.
	 *
	 * Mirrors `superset workspaces create`.
	 */
	async create(
		params: WorkspaceCreateParams = {},
		options?: RequestOptions,
	): Promise<CloudWorkspace> {
		const organizationId = this._requireOrgId();
		for (const field of ["prompt", "model", "effort"] as const) {
			if (params[field] !== undefined && !params.agent) {
				throw new SupersetError(`\`${field}\` requires \`agent\``);
			}
		}
		if (params.agent && !params.prompt) {
			throw new SupersetError("`agent` requires `prompt`");
		}

		const { result } = await this._client.get<EnvironmentListWire>(
			"/api/trpc/environment.list",
			{
				...options,
				query: { input: JSON.stringify({ json: { organizationId } }) },
			},
		);
		const environment = selectEnvironment(
			result.data.json,
			params.environment,
		);

		return this._client.mutation<CloudWorkspace>(
			{ method: "workspaces.create", procedure: "cloudWorkspace.create" },
			{
				organizationId,
				environmentId: environment.id,
				name: params.name,
				branch: params.branch,
				agent: params.agent,
				prompt: params.prompt,
				model: params.model,
				effort: params.effort,
			},
			options,
		);
	}

	/**
	 * Rename a cloud workspace.
	 *
	 * Mirrors `superset workspaces update`.
	 */
	update(
		id: string,
		params: WorkspaceUpdateParams,
		options?: RequestOptions,
	): APIPromise<CloudWorkspace> {
		return this._client.mutation<CloudWorkspace>(
			{ method: "workspaces.update", procedure: "cloudWorkspace.rename" },
			{ id, name: params.name },
			options,
		);
	}

	/**
	 * Delete a cloud workspace and tear down its sandbox. `deleted` is false
	 * when no workspace has that id.
	 *
	 * Mirrors `superset workspaces delete`.
	 */
	delete(
		id: string,
		options?: RequestOptions,
	): APIPromise<WorkspaceDeleteResult> {
		return this._client.mutation<WorkspaceDeleteResult>(
			{ method: "workspaces.delete", procedure: "cloudWorkspace.delete" },
			{ id },
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

function selectEnvironment<
	T extends { id: string; name: string; repositories: ReadonlyArray<unknown> | null },
>(environments: T[], requested: string | undefined): T {
	const startable = environments.filter(
		(environment) => (environment.repositories ?? []).length > 0,
	);
	if (startable.length === 0) {
		throw new SupersetError(
			"No environment with repositories in this organization. Create one in Settings → Environments before creating a cloud workspace.",
		);
	}
	const wanted = requested?.trim().toLowerCase();
	const selected =
		wanted === undefined
			? startable[0]
			: environments.find(
					(environment) =>
						environment.id.toLowerCase() === wanted ||
						environment.name.toLowerCase() === wanted,
				);
	if (!selected || !startable.includes(selected)) {
		const names = startable.map((environment) => environment.name).join(", ");
		throw new SupersetError(
			selected
				? `Environment "${selected.name}" has no repositories. Start from one with repositories: ${names}`
				: `No environment "${requested}" in this organization. Start from one with repositories: ${names}`,
		);
	}
	return selected;
}

export type CloudWorkspaceStatus =
	| "provisioning"
	| "ready"
	| "failed"
	| "deleted";

export interface CloudWorkspace {
	id: string;
	organizationId: string;
	name: string;
	branch: string;
	/** Only `ready` workspaces accept terminals and agents. */
	status: CloudWorkspaceStatus;
	environmentId: string;
	provider: string;
	providerSandboxId: string;
	sandboxUrl: string | null;
	hostVersion: string | null;
	createdByUserId: string | null;
	createdAt: string;
	updatedAt: string;
	deletedAt: string | null;
}

export type WorkspaceListResponse = Array<CloudWorkspace>;

export interface WorkspaceListParams {
	/** Substring match against workspace name or branch. */
	search?: string;
}

export interface WorkspaceCreateParams {
	/** Environment id or name. Defaults to the first environment with repositories. */
	environment?: string;
	/** Workspace name. Omit to have one generated from `prompt`. */
	name?: string;
	/** Branch to check out. Defaults to the primary repository's default branch. */
	branch?: string;
	/** Built-in agent to launch on first boot (e.g. `"claude"` or `"codex"`). Requires `prompt`. */
	agent?: string;
	/** Prompt the agent starts with. Requires `agent`. */
	prompt?: string;
	/** Model for the agent. Supported values depend on the agent; omit to use its default. */
	model?: string;
	/** Reasoning effort for the agent. Supported values depend on the agent; omit to use its default. */
	effort?: string;
}

export interface WorkspaceUpdateParams {
	/** New workspace name. */
	name: string;
}

export interface WorkspaceDeleteResult {
	deleted: boolean;
}

export declare namespace Workspaces {
	export type {
		CloudWorkspace,
		CloudWorkspaceStatus,
		WorkspaceListResponse,
		WorkspaceListParams,
		WorkspaceCreateParams,
		WorkspaceUpdateParams,
		WorkspaceDeleteResult,
	};
}
