import type { APIPromise } from "../core/api-promise";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

export class Automations extends APIResource {
	/**
	 * List automations in the active organization. Returned rows omit the
	 * `prompt` body — fetch one prompt with `getPrompt(id)`.
	 *
	 * Mirrors `superset automations list`.
	 */
	list(
		params?: AutomationListParams,
		options?: RequestOptions,
	): APIPromise<AutomationListResponse> {
		return this._client.query<AutomationListResponse>(
			{ method: "automations.list", procedure: "automation.list" },
			params,
			options,
		);
	}

	/**
	 * Retrieve a single automation by id. The `prompt` body is omitted —
	 * fetch it separately with `getPrompt(id)`.
	 *
	 * Mirrors `superset automations get`.
	 */
	retrieve(
		id: string,
		options?: RequestOptions,
	): APIPromise<AutomationSummary> {
		return this._client.query<AutomationSummary>(
			{ method: "automations.retrieve", procedure: "automation.get" },
			{ id },
			options,
		);
	}

	/**
	 * Create a recurring automation.
	 *
	 * Mirrors `superset automations create`.
	 */
	create(
		body: AutomationCreateParams,
		options?: RequestOptions,
	): APIPromise<Automation> {
		return this._client.mutation<Automation>(
			{ method: "automations.create", procedure: "automation.create" },
			body,
			options,
		);
	}

	/**
	 * Update an automation. All fields except `id` are optional patches.
	 *
	 * Mirrors `superset automations update`.
	 */
	update(
		body: AutomationUpdateParams,
		options?: RequestOptions,
	): APIPromise<Automation> {
		return this._client.mutation<Automation>(
			{ method: "automations.update", procedure: "automation.update" },
			body,
			options,
		);
	}

	/**
	 * Delete an automation by id.
	 *
	 * Mirrors `superset automations delete`.
	 */
	delete(id: string, options?: RequestOptions): APIPromise<void> {
		return this._client
			.mutation<unknown>({ method: "automations.delete", procedure: "automation.delete" }, { id }, options)
			._thenUnwrap(() => undefined);
	}

	/**
	 * Trigger an automation to run immediately, off-schedule.
	 *
	 * Mirrors `superset automations run`.
	 */
	run(id: string, options?: RequestOptions): APIPromise<AutomationRunDispatched> {
		return this._client.mutation<AutomationRunDispatched>(
			{ method: "automations.run", procedure: "automation.runNow" },
			{ id },
			options,
		);
	}

	/**
	 * Pause an automation (stops future scheduled runs).
	 *
	 * Mirrors `superset automations pause`.
	 */
	pause(id: string, options?: RequestOptions): APIPromise<Automation> {
		return this._client.mutation<Automation>(
			{ method: "automations.pause", procedure: "automation.setEnabled" },
			{ id, enabled: false },
			options,
		);
	}

	/**
	 * Resume a previously-paused automation.
	 *
	 * Mirrors `superset automations resume`.
	 */
	resume(id: string, options?: RequestOptions): APIPromise<Automation> {
		return this._client.mutation<Automation>(
			{ method: "automations.resume", procedure: "automation.setEnabled" },
			{ id, enabled: true },
			options,
		);
	}

	/**
	 * Run history for a single automation.
	 *
	 * Mirrors `superset automations logs`.
	 */
	logs(
		automationId: string,
		params?: AutomationLogsParams,
		options?: RequestOptions,
	): APIPromise<AutomationLogsResponse> {
		return this._client.query<AutomationLogsResponse>(
			{ method: "automations.logs", procedure: "automation.listRuns" },
			{ automationId, limit: params?.limit ?? 20 },
			options,
		);
	}

	/**
	 * Get the prompt body (markdown) for an automation. `retrieve` and
	 * `list` omit it because it can be large.
	 *
	 * Mirrors `superset automations prompt get`.
	 */
	getPrompt(
		id: string,
		options?: RequestOptions,
	): APIPromise<{ prompt: string }> {
		return this._client.query<{ prompt: string }>(
			{ method: "automations.getPrompt", procedure: "automation.getPrompt" },
			{ id },
			options,
		);
	}

	/**
	 * Replace the prompt body for an automation. The new prompt fully
	 * overwrites the old one.
	 *
	 * Mirrors `superset automations prompt set`.
	 */
	setPrompt(
		id: string,
		prompt: string,
		options?: RequestOptions,
	): APIPromise<Automation> {
		return this._client.mutation<Automation>(
			{ method: "automations.setPrompt", procedure: "automation.setPrompt" },
			{ id, prompt },
			options,
		);
	}
}

/**
 * Lean automation row returned by `list` and `retrieve`. The `prompt`
 * body is omitted — call `getPrompt(id)` to fetch it.
 */
export interface AutomationSummary {
	id: string;
	organizationId: string;
	ownerUserId: string;
	name: string;
	/** Host agent instance id (UUID) or presetId. */
	agent: string;
	targetHostId: string | null;
	/** Null = session automation: runs use project-less session workspaces. */
	v2ProjectId: string | null;
	v2WorkspaceId: string | null;
	/** Workspace tags applied to each run's created workspace. */
	tags: string[];
	rrule: string;
	dtstart: string;
	timezone: string;
	enabled: boolean;
	nextRunAt: string;
	/** Human-readable schedule description, derived from rrule. */
	scheduleText?: string;
	createdAt: string;
	updatedAt: string;
}

/**
 * Full automation row including the `prompt` body. Returned by mutations
 * like `create`, `update`, `pause`, `resume`, and `setPrompt`.
 */
export interface Automation extends AutomationSummary {
	prompt: string;
}

export type AutomationListResponse = Array<AutomationSummary>;

export interface AutomationListParams {
	/** Case-insensitive substring match on automation name. */
	name?: string;
}

export interface AutomationCreateParams {
	name: string;
	prompt: string;
	/** Host agent instance id (UUID) or presetId. */
	agent: string;
	rrule: string;
	timezone: string;
	/**
	 * Project for new-workspace-per-run mode. Omit both this and
	 * `v2WorkspaceId` for session mode: each run creates a project-less
	 * session workspace. When passing `v2WorkspaceId`, also set this to the
	 * workspace's `projectId` (null for a session workspace) — workspace
	 * records are host-owned, so supplying the full pin lets the API skip its
	 * workspace-registry lookup (which is being retired).
	 */
	v2ProjectId?: string | null;
	/**
	 * Reuse an existing workspace every run. Pair it with `targetHostId` and
	 * `v2ProjectId` from the same workspace row.
	 */
	v2WorkspaceId?: string | null;
	/**
	 * Pin the automation to a specific host. When passing `v2WorkspaceId`, set
	 * this to the workspace's `hostId`.
	 */
	targetHostId?: string | null;
	/** ISO timestamp; defaults to now if omitted. */
	dtstart?: string;
	/**
	 * Workspace tags applied to each run's created workspace; each tag files
	 * it into a sidebar folder of the same name. Defaults to ["automation"]
	 * so runs group out of the box; pass [] to opt out.
	 */
	tags?: string[];
}

export interface AutomationUpdateParams {
	id: string;
	name?: string;
	agent?: string;
	/**
	 * When passing `v2WorkspaceId`, set this to the workspace's `hostId` —
	 * workspace records are host-owned, so supplying the full pin
	 * (`targetHostId` + `v2ProjectId`) lets the API skip its
	 * workspace-registry lookup (which is being retired).
	 */
	targetHostId?: string | null;
	/**
	 * When passing `v2WorkspaceId`, set this to the workspace's `projectId`
	 * (null for a session workspace). Explicit null switches the automation
	 * to session mode; if a session workspace is currently pinned, also send
	 * `v2WorkspaceId: null` to reach unpinned new-session-per-run mode (a
	 * project *change* clears the pin automatically, null-to-null does not).
	 */
	v2ProjectId?: string | null;
	/**
	 * Reuse an existing workspace every run. Pair it with `targetHostId` and
	 * `v2ProjectId` from the same workspace row.
	 */
	v2WorkspaceId?: string | null;
	rrule?: string;
	dtstart?: string;
	timezone?: string;
	/** Full replacement of the automation's tag set. */
	tags?: string[];
}

export interface AutomationRun {
	id: string;
	automationId: string;
	organizationId: string;
	status: "dispatching" | "dispatched" | "skipped_offline" | "dispatch_failed";
	scheduledFor: string;
	dispatchedAt: string | null;
	hostId: string | null;
	error: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AutomationLogsParams {
	/** Max runs to return (1-100, default 20). */
	limit?: number;
}

export type AutomationLogsResponse = Array<AutomationRun>;

/**
 * What `automations.run()` returns — the API gives back identifiers for the
 * dispatched run, not the full `AutomationRun` row. Fetch the full row via
 * `automations.logs(automationId)` if you need its status or hostId.
 */
export interface AutomationRunDispatched {
	automationId: string;
	runId: string;
}

export declare namespace Automations {
	export type {
		Automation,
		AutomationSummary,
		AutomationListParams,
		AutomationListResponse,
		AutomationCreateParams,
		AutomationUpdateParams,
		AutomationRun,
		AutomationRunDispatched,
		AutomationLogsParams,
		AutomationLogsResponse,
	};
}
