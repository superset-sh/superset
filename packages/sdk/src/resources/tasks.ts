import type { APIPromise } from "../core/api-promise";
import { APIResource } from "../core/resource";
import type { RequestOptions } from "../internal/request-options";

/**
 * Wire-format helpers — the tRPC procedures return internal shapes geared for
 * optimistic-update plumbing (e.g. `{ task, txid }`). The SDK reshapes them
 * here so consumers see clean `Task` objects.
 */
type CreateOrUpdateWire = { task: Task; txid: number };
type DeleteWire = { txid: number };
type ListRowWire = {
	task: Task;
	assignee: { id: string; name: string | null; image: string | null } | null;
	creator: { id: string; name: string | null; image: string | null } | null;
	statusName: string | null;
};

export class Tasks extends APIResource {
	/**
	 * Create a task.
	 *
	 * @example
	 * ```ts
	 * const task = await client.tasks.create({ title: 'Wire up auth' });
	 * ```
	 */
	create(body: TaskCreateParams, options?: RequestOptions): APIPromise<Task> {
		return this._client
			.mutation<CreateOrUpdateWire>("task.create", body, options)
			._thenUnwrap((r) => r.task);
	}

	/**
	 * Retrieve a task by id or slug. Returns `null` if no matching task exists
	 * (the underlying `task.byIdOrSlug` procedure resolves to null rather than
	 * throwing 404, so we surface that honestly here).
	 *
	 * @example
	 * ```ts
	 * const task = await client.tasks.retrieve('SUPER-172');
	 * if (!task) throw new Error('not found');
	 * ```
	 */
	retrieve(
		idOrSlug: string,
		options?: RequestOptions,
	): APIPromise<Task | null> {
		return this._client.query<Task | null>(
			"task.byIdOrSlug",
			idOrSlug,
			options,
		);
	}

	/**
	 * List tasks with optional filters. All filter params are AND-combined.
	 * Each row includes the task plus denormalized assignee/creator/status
	 * display fields so consumers don't have to make follow-up calls.
	 *
	 * @example
	 * ```ts
	 * const tasks = await client.tasks.list({ assigneeMe: true, priority: 'high' });
	 * ```
	 */
	list(
		query?: TaskListParams | null | undefined,
		options?: RequestOptions,
	): APIPromise<TaskListResponse> {
		return this._client
			.query<Array<ListRowWire>>("task.list", query ?? undefined, options)
			._thenUnwrap((rows) =>
				rows.map((row) => ({
					...row.task,
					assigneeName: row.assignee?.name ?? null,
					assigneeImage: row.assignee?.image ?? null,
					creatorName: row.creator?.name ?? null,
					creatorImage: row.creator?.image ?? null,
					statusName: row.statusName,
				})),
			);
	}

	/**
	 * Update a task. `id` is required; all other fields are optional patches.
	 */
	update(body: TaskUpdateParams, options?: RequestOptions): APIPromise<Task> {
		return this._client
			.mutation<CreateOrUpdateWire>("task.update", body, options)
			._thenUnwrap((r) => r.task);
	}

	/**
	 * Soft-delete a task by id.
	 */
	delete(id: string, options?: RequestOptions): APIPromise<void> {
		return this._client
			.mutation<DeleteWire>("task.delete", id, options)
			._thenUnwrap(() => undefined);
	}
}

export type TaskPriority = "urgent" | "high" | "medium" | "low" | "none";

export interface Task {
	id: string;
	slug: string;
	title: string;
	description: string | null;
	statusId: string;
	priority: TaskPriority;
	organizationId: string;
	assigneeId: string | null;
	creatorId: string;
	estimate: number | null;
	dueDate: string | null;
	labels: string[];
	branch: string | null;
	prUrl: string | null;
	externalProvider: string | null;
	externalId: string | null;
	externalKey: string | null;
	externalUrl: string | null;
	lastSyncedAt: string | null;
	syncError: string | null;
	assigneeExternalId: string | null;
	assigneeDisplayName: string | null;
	assigneeAvatarUrl: string | null;
	startedAt: string | null;
	completedAt: string | null;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface TaskListItem extends Task {
	/** Joined display fields — name/image of the internal assignee user. */
	assigneeName: string | null;
	assigneeImage: string | null;
	creatorName: string | null;
	creatorImage: string | null;
	statusName: string | null;
}

export type TaskListResponse = Array<TaskListItem>;

export interface TaskCreateParams {
	title: string;
	description?: string | null;
	statusId?: string | null;
	priority?: TaskPriority;
	assigneeId?: string | null;
	estimate?: number | null;
	dueDate?: string | null;
	labels?: string[] | null;
}

export interface TaskUpdateParams {
	id: string;
	title?: string;
	description?: string | null;
	statusId?: string;
	priority?: TaskPriority;
	assigneeId?: string | null;
	prUrl?: string | null;
	estimate?: number | null;
	dueDate?: string | null;
	labels?: string[] | null;
}

export interface TaskListParams {
	statusId?: string | null;
	priority?: TaskPriority | null;
	assigneeId?: string | null;
	assigneeMe?: boolean | null;
	creatorMe?: boolean | null;
	search?: string | null;
	limit?: number;
	offset?: number;
}

export declare namespace Tasks {
	export type {
		Task,
		TaskListItem,
		TaskListResponse,
		TaskCreateParams,
		TaskUpdateParams,
		TaskListParams,
	};
}
