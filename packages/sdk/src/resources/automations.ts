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
			"automation.list",
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
			"automation.get",
			{ id },
			options,
		);
	}

	/**
	 * Create a recurring automation. Requires a Pro plan on the organization.
	 *
	 * Mirrors `superset automations create`.
	 */
	create(
		body: AutomationCreateParams,
		options?: RequestOptions,
	): APIPromise<Automation> {
		return this._client.mutation<Automation>(
			"automation.create",
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
			"automation.update",
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
			.mutation<unknown>("automation.delete", { id }, options)
			._thenUnwrap(() => undefined);
	}

	/**
	 * Trigger an automation to run immediately, off-schedule.
	 *
	 * Mirrors `superset automations run`.
	 */
	run(id: string, options?: RequestOptions): APIPromise<AutomationRunDispatched> {
		return this._client.mutation<AutomationRunDispatched>(
			"automation.runNow",
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
			"automation.setEnabled",
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
			"automation.setEnabled",
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
			"automation.listRuns",
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
			"automation.getPrompt",
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
			"automation.setPrompt",
			{ id, prompt },
			options,
		);
	}
}

export interface AgentConfig {
	id: string;
	kind: "terminal" | "chat";
	/** Other fields (command, promptCommand, etc.) pass through. */
	[key: string]: unknown;
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
	agentConfig: AgentConfig;
	targetHostId: string | null;
	v2ProjectId: string;
	v2WorkspaceId: string | null;
	rrule: string;
	dtstart: string;
	timezone: string;
	enabled: boolean;
	mcpScope: string[];
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
	agentConfig: AgentConfig;
	rrule: string;
	timezone: string;
	/** One of `v2ProjectId` or `v2WorkspaceId` is required. */
	v2ProjectId?: string;
	v2WorkspaceId?: string | null;
	/** Pin the automation to a specific host. */
	targetHostId?: string | null;
	/** ISO timestamp; defaults to now if omitted. */
	dtstart?: string;
	/** MCP server names this automation is allowed to use. */
	mcpScope?: string[];
}

export interface AutomationUpdateParams {
	id: string;
	name?: string;
	agentConfig?: AgentConfig;
	targetHostId?: string | null;
	v2ProjectId?: string;
	v2WorkspaceId?: string | null;
	rrule?: string;
	dtstart?: string;
	timezone?: string;
	mcpScope?: string[];
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
		AgentConfig,
	};
}
