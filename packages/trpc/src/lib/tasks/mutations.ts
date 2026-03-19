import { db, dbWs } from "@superset/db/client";
import type {
	IntegrationProvider,
	SelectTask,
	TaskPriority,
} from "@superset/db/schema";
import { tasks } from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { getCurrentTxid } from "@superset/db/utils";
import type { SQL } from "drizzle-orm";
import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { syncTask } from "../integrations/sync";

export interface CreateTaskMutationInput {
	title: string;
	description?: string | null;
	priority?: TaskPriority;
	assigneeId?: string | null;
	statusId?: string;
	labels?: string[] | null;
	dueDate?: Date | null;
	estimate?: number | null;
	slug?: string | null;
	branch?: string | null;
}

export interface UpdateTaskMutationInput {
	id: string;
	title?: string;
	description?: string | null;
	priority?: TaskPriority;
	assigneeId?: string | null;
	statusId?: string;
	labels?: string[] | null;
	dueDate?: Date | null;
	estimate?: number | null;
	branch?: string | null;
	prUrl?: string | null;
}

export interface ResolvedTaskReference {
	id: string;
	externalProvider: IntegrationProvider | null;
	externalId: string | null;
}

export interface CreateTasksResult {
	tasks: SelectTask[];
	txid: number;
}

export interface UpdateTasksResult {
	tasks: SelectTask[];
	txid: number;
}

export interface DeleteTasksResult {
	taskIds: string[];
	txid: number;
}

function enqueueTaskSync(taskId: string) {
	void syncTask(taskId).catch((error) => {
		console.error(
			`[task-mutations] Failed to queue sync for task ${taskId}:`,
			error,
		);
	});
}

function generateUniqueSlug(
	baseSlug: string,
	existingSlugs: Set<string>,
): string {
	let slug = baseSlug;
	if (existingSlugs.has(slug)) {
		let counter = 1;
		while (existingSlugs.has(slug)) {
			slug = `${baseSlug}-${counter++}`;
		}
	}
	return slug;
}

export async function resolveTaskReference({
	organizationId,
	taskRef,
}: {
	organizationId: string;
	taskRef: string;
}): Promise<ResolvedTaskReference | null> {
	const isUuid =
		taskRef.length === 36 &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			taskRef,
		);

	const findTask = async (condition: SQL<unknown>) =>
		db
			.select({
				id: tasks.id,
				externalProvider: tasks.externalProvider,
				externalId: tasks.externalId,
			})
			.from(tasks)
			.where(
				and(
					condition,
					eq(tasks.organizationId, organizationId),
					isNull(tasks.deletedAt),
				),
			)
			.limit(1)
			.then((rows) => rows[0] ?? null);

	if (isUuid) {
		const taskById = await findTask(eq(tasks.id, taskRef));
		if (taskById) {
			return taskById;
		}
	}

	const taskByExternalKey = await findTask(eq(tasks.externalKey, taskRef));
	if (taskByExternalKey) {
		return taskByExternalKey;
	}

	return findTask(eq(tasks.slug, taskRef));
}

export async function createTasks({
	organizationId,
	creatorId,
	inputs,
}: {
	organizationId: string;
	creatorId: string;
	inputs: CreateTaskMutationInput[];
}): Promise<CreateTasksResult> {
	let defaultStatusId: string | undefined;
	const needsDefaultStatus = inputs.some((input) => !input.statusId);

	if (needsDefaultStatus) {
		defaultStatusId = await seedDefaultStatuses(organizationId);
	}

	const preparedInputs = inputs.map((input) => {
		const id = crypto.randomUUID();
		return {
			id,
			input,
			baseSlug: input.slug?.trim() || id.slice(0, 8),
		};
	});
	const uniqueBaseSlugs = [
		...new Set(preparedInputs.map((item) => item.baseSlug)),
	];
	const slugConditions = uniqueBaseSlugs.map((baseSlug) =>
		ilike(tasks.slug, `${baseSlug}%`),
	);

	const existingTasks =
		slugConditions.length > 0
			? await db
					.select({ slug: tasks.slug })
					.from(tasks)
					.where(
						and(
							eq(tasks.organizationId, organizationId),
							or(...slugConditions),
						),
					)
			: [];

	const usedSlugs = new Set(existingTasks.map((task) => task.slug));
	const values = preparedInputs.map(({ id, input, baseSlug }) => {
		const slug = generateUniqueSlug(baseSlug, usedSlugs);
		usedSlugs.add(slug);

		return {
			id,
			slug,
			title: input.title,
			description: input.description ?? null,
			priority: input.priority ?? "none",
			statusId: input.statusId ?? (defaultStatusId as string),
			organizationId,
			creatorId,
			assigneeId: input.assigneeId ?? null,
			assigneeExternalId: null,
			assigneeDisplayName: null,
			assigneeAvatarUrl: null,
			labels: input.labels ?? [],
			dueDate: input.dueDate ?? null,
			estimate: input.estimate ?? null,
			branch: input.branch ?? null,
		};
	});

	const result = await dbWs.transaction(async (tx) => {
		const createdTasks = await tx.insert(tasks).values(values).returning();
		const txid = await getCurrentTxid(tx);

		return { tasks: createdTasks, txid };
	});

	for (const task of result.tasks) {
		enqueueTaskSync(task.id);
	}

	return result;
}

function buildTaskUpdateData(input: Omit<UpdateTaskMutationInput, "id">) {
	const updateData: Record<string, unknown> = {};

	if (input.title !== undefined) updateData.title = input.title;
	if (input.description !== undefined)
		updateData.description = input.description;
	if (input.priority !== undefined) updateData.priority = input.priority;
	if (input.assigneeId !== undefined) {
		updateData.assigneeId = input.assigneeId;
		updateData.assigneeExternalId = null;
		updateData.assigneeDisplayName = null;
		updateData.assigneeAvatarUrl = null;
	}
	if (input.statusId !== undefined) updateData.statusId = input.statusId;
	if (input.labels !== undefined) updateData.labels = input.labels;
	if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
	if (input.estimate !== undefined) updateData.estimate = input.estimate;
	if (input.branch !== undefined) updateData.branch = input.branch;
	if (input.prUrl !== undefined) updateData.prUrl = input.prUrl;

	return updateData;
}

export async function updateTasks({
	organizationId,
	inputs,
}: {
	organizationId: string;
	inputs: UpdateTaskMutationInput[];
}): Promise<UpdateTasksResult> {
	const result = await dbWs.transaction(async (tx) => {
		const updatedTasks: SelectTask[] = [];

		for (const input of inputs) {
			const { id, ...rest } = input;
			const updateData = buildTaskUpdateData(rest);

			if (Object.keys(updateData).length === 0) {
				continue;
			}

			const [task] = await tx
				.update(tasks)
				.set(updateData)
				.where(
					and(
						eq(tasks.id, id),
						eq(tasks.organizationId, organizationId),
						isNull(tasks.deletedAt),
					),
				)
				.returning();

			if (task) {
				updatedTasks.push(task);
			}
		}

		const txid = await getCurrentTxid(tx);

		return { tasks: updatedTasks, txid };
	});

	for (const task of result.tasks) {
		enqueueTaskSync(task.id);
	}

	return result;
}

export async function deleteTasks({
	organizationId,
	taskIds,
}: {
	organizationId: string;
	taskIds: string[];
}): Promise<DeleteTasksResult> {
	const result = await dbWs.transaction(async (tx) => {
		const deletedTasks = await tx
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(
				and(
					inArray(tasks.id, taskIds),
					eq(tasks.organizationId, organizationId),
					isNull(tasks.deletedAt),
				),
			)
			.returning({
				id: tasks.id,
				externalProvider: tasks.externalProvider,
				externalId: tasks.externalId,
			});

		const txid = await getCurrentTxid(tx);

		return { deletedTasks, txid };
	});

	for (const task of result.deletedTasks) {
		if (task.externalProvider && task.externalId) {
			enqueueTaskSync(task.id);
		}
	}

	return {
		taskIds: result.deletedTasks.map((task) => task.id),
		txid: result.txid,
	};
}
