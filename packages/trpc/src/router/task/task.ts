import { db, dbWs } from "@superset/db/client";
import {
	type InsertTaskImport,
	members,
	taskImports,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import {
	buildTaskListConditions,
	buildTaskListOrderBy,
	InvalidDueDateRangeError,
	normalizeDueDateRange,
	taskColumns,
	taskCreatedAtSortKey,
} from "@superset/db/task-list-query";
import { getCurrentTxid } from "@superset/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, desc, eq, isNull, lt, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { anchorAttachments } from "../../lib/attachments";
import {
	referencedFileIds,
	toReadableDocument,
	toStoredDocument,
} from "../../lib/document-files";
import { setTaskLabels } from "../../lib/labels";
import { protectedProcedure, type TRPCContext } from "../../trpc";
import { getIssue, type LinearStateType } from "../integration/linear/api";
import { withLinear } from "../integration/linear/live";
import { verifyOrgMembership } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";
import {
	diffTaskActivity,
	labelActivity,
	recordTaskActivity,
} from "./activity";
import {
	createTaskSchema,
	type TaskListFilterInput,
	taskListInputSchema,
	taskListPageInputSchema,
	updateTaskSchema,
} from "./schema";
import { taskStatusesRouter } from "./statuses";

const TASK_IMPORT_CONSTRAINT = "task_imports_org_provider_external_unique";

function isConstraintError(error: unknown, constraint: string): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const maybeError = error as { code?: string; constraint?: string };
	return maybeError.code === "23505" && maybeError.constraint === constraint;
}

type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof db | DbWsTransaction;

async function getTaskAccess(
	executor: Executor,
	userId: string,
	taskId: string,
) {
	return requireOrgResourceAccess(
		userId,
		async () => {
			const [task] = await executor
				.select({
					id: tasks.id,
					organizationId: tasks.organizationId,
				})
				.from(tasks)
				.where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
				.limit(1);

			return task ?? null;
		},
		{
			message: "Task not found",
		},
	);
}

async function getTaskById(userId: string, taskId: string) {
	const [task] = await db
		.select(taskColumns)
		.from(tasks)
		.where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
		.limit(1);

	if (!task) {
		return null;
	}

	await verifyOrgMembership(userId, task.organizationId);

	return task;
}

async function getTaskBySlug(
	userId: string,
	organizationId: string,
	slug: string,
) {
	await verifyOrgMembership(userId, organizationId);

	const [task] = await db
		.select(taskColumns)
		.from(tasks)
		.where(
			and(
				eq(tasks.slug, slug),
				eq(tasks.organizationId, organizationId),
				isNull(tasks.deletedAt),
			),
		)
		.limit(1);

	return task ?? null;
}

async function getScopedStatusId(
	executor: Executor,
	organizationId: string,
	statusId: string,
	message: string,
) {
	const status = await requireOrgScopedResource(
		async () => {
			const [status] = await executor
				.select({
					id: taskStatuses.id,
					organizationId: taskStatuses.organizationId,
				})
				.from(taskStatuses)
				.where(eq(taskStatuses.id, statusId))
				.limit(1);

			return status ?? null;
		},
		{
			code: "BAD_REQUEST",
			message,
			organizationId,
		},
	);

	return status.id;
}

async function getScopedAssigneeId(
	executor: Executor,
	organizationId: string,
	assigneeId: string | null,
	message: string,
) {
	if (!assigneeId) {
		return null;
	}

	const member = await requireOrgScopedResource(
		async () => {
			const [member] = await executor
				.select({
					organizationId: members.organizationId,
					userId: members.userId,
				})
				.from(members)
				.innerJoin(users, eq(members.userId, users.id))
				.where(
					and(
						eq(members.organizationId, organizationId),
						eq(members.userId, assigneeId),
						isNull(users.deletionRequestedAt),
					),
				)
				.limit(1);

			return member ?? null;
		},
		{
			code: "BAD_REQUEST",
			message,
			organizationId,
		},
	);

	return member.userId;
}

type CreateTaskContext = {
	session: NonNullable<TRPCContext["session"]>;
	activeOrganizationId: string | null;
};

type ImportSource = Pick<
	InsertTaskImport,
	"provider" | "externalId" | "externalUrl"
>;

async function createTask(
	ctx: CreateTaskContext,
	input: z.infer<typeof createTaskSchema>,
	importedFrom?: ImportSource,
) {
	const organizationId = await requireActiveOrgMembership(ctx);

	const result = await dbWs.transaction(async (tx) => {
		const statusId = input.statusId
			? await getScopedStatusId(
					tx,
					organizationId,
					input.statusId,
					"Status must belong to the active organization",
				)
			: await seedDefaultStatuses(organizationId, tx);

		const assigneeId = input.assigneeId
			? await getScopedAssigneeId(
					tx,
					organizationId,
					input.assigneeId,
					"Assignee must belong to the active organization",
				)
			: null;

		const taskId = crypto.randomUUID();
		const [task] = await tx
			.insert(tasks)
			.values({
				id: taskId,
				title: input.title,
				description: input.description
					? toStoredDocument(input.description, {
							kind: "tasks",
							id: taskId,
						})
					: null,
				statusId,
				priority: input.priority ?? "none",
				organizationId,
				creatorId: ctx.session.user.id,
				assigneeId,
				estimate: input.estimate ?? null,
				dueDate: input.dueDate ?? null,
			})
			.returning({ id: tasks.id });
		if (task && input.labels?.length) {
			await setTaskLabels(tx, {
				organizationId,
				taskId: task.id,
				names: input.labels,
			});
		}
		const [created] = task
			? await tx.select(taskColumns).from(tasks).where(eq(tasks.id, task.id))
			: [];

		if (task && importedFrom) {
			await tx.insert(taskImports).values({
				...importedFrom,
				taskId: task.id,
				organizationId,
				importedByUserId: ctx.session.user.id,
			});
		}

		const txid = await getCurrentTxid(tx);

		return { task: created, txid };
	});

	if (result.task) {
		const { id, organizationId, description } = result.task;
		if (description) {
			await anchorAttachments({
				parentKind: "issue",
				parentId: id,
				organizationId,
				fileIds: referencedFileIds(description, { kind: "tasks", id }),
			}).catch((error) => {
				console.error(
					`[task] could not keep the description's files for ${id}`,
					error,
				);
			});
		}
	}

	return result;
}

const NATIVE_STATUS_TYPE_BY_LINEAR: Record<LinearStateType, string> = {
	triage: "backlog",
	backlog: "backlog",
	unstarted: "unstarted",
	started: "started",
	completed: "completed",
	canceled: "canceled",
};

async function nativeStatusIdFor(
	organizationId: string,
	linearStateType: LinearStateType,
) {
	const backlogId = await seedDefaultStatuses(organizationId);
	const [status] = await db
		.select({ id: taskStatuses.id })
		.from(taskStatuses)
		.where(
			and(
				eq(taskStatuses.organizationId, organizationId),
				eq(taskStatuses.type, NATIVE_STATUS_TYPE_BY_LINEAR[linearStateType]),
				isNull(taskStatuses.externalProvider),
			),
		)
		.orderBy(asc(taskStatuses.position))
		.limit(1);
	return status?.id ?? backlogId;
}

async function findImportedTask(organizationId: string, externalId: string) {
	const [row] = await db
		.select({ task: tasks })
		.from(taskImports)
		.innerJoin(tasks, eq(taskImports.taskId, tasks.id))
		.where(
			and(
				eq(taskImports.organizationId, organizationId),
				eq(taskImports.provider, "linear"),
				eq(taskImports.externalId, externalId),
				isNull(tasks.deletedAt),
			),
		)
		.limit(1);
	return row?.task ?? null;
}

async function importLinearIssue(ctx: CreateTaskContext, issueId: string) {
	const organizationId = await requireActiveOrgMembership(ctx);
	const issue = await withLinear(
		ctx.session.user.id,
		organizationId,
		(client) => getIssue(client, issueId),
	);

	const existing = await findImportedTask(organizationId, issue.id);
	if (existing) return { task: existing, imported: false };

	const statusId = await nativeStatusIdFor(organizationId, issue.state.type);
	try {
		const { task } = await createTask(
			ctx,
			{
				title: issue.title,
				description: issue.description,
				statusId,
				priority: issue.priority,
			},
			{ provider: "linear", externalId: issue.id, externalUrl: issue.url },
		);
		return { task, imported: true };
	} catch (error) {
		if (!isConstraintError(error, TASK_IMPORT_CONSTRAINT)) throw error;
		const raced = await findImportedTask(organizationId, issue.id);
		if (!raced) throw error;
		return { task: raced, imported: false };
	}
}

function selectTaskListRows() {
	const assignee = alias(users, "assignee");
	const creator = alias(users, "creator");
	const status = alias(taskStatuses, "status");

	return db
		.select({
			task: taskColumns,
			assignee: {
				id: assignee.id,
				name: assignee.name,
				image: assignee.image,
			},
			creator: {
				id: creator.id,
				name: creator.name,
				image: creator.image,
			},
			statusName: status.name,
		})
		.from(tasks)
		.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
		.leftJoin(creator, eq(tasks.creatorId, creator.id))
		.leftJoin(status, eq(tasks.statusId, status.id));
}

function buildTaskListFilters(
	organizationId: string,
	userId: string,
	input: TaskListFilterInput | null | undefined,
) {
	let dueDateRange: { from?: Date; to?: Date };
	try {
		dueDateRange = normalizeDueDateRange(
			input?.dueDateFrom ?? undefined,
			input?.dueDateTo ?? undefined,
		);
	} catch (error) {
		if (error instanceof InvalidDueDateRangeError) {
			throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
		}
		throw error;
	}

	return buildTaskListConditions({
		organizationId,
		nativeOnly: input?.nativeOnly ?? undefined,
		statusId: input?.statusId ?? undefined,
		priority: input?.priority ?? undefined,
		assigneeId: input?.assigneeMe ? userId : (input?.assigneeId ?? undefined),
		creatorId: input?.creatorMe ? userId : undefined,
		search: input?.search ?? undefined,
		externalProjectId: input?.externalProjectId ?? undefined,
		externalProjectName: input?.externalProjectName ?? undefined,
		externalCycleId: input?.externalCycleId ?? undefined,
		dueDateFrom: dueDateRange.from,
		dueDateTo: dueDateRange.to,
	});
}

export const taskRouter = {
	statuses: taskStatusesRouter,

	/**
	 * @deprecated Use `task.list` instead. Kept for one release cycle so the
	 * shipped CLI on `main` keeps compiling against the new backend during
	 * the CLI-v1 split rollout.
	 */
	all: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const assignee = alias(users, "assignee");
		const creator = alias(users, "creator");
		return db
			.select({
				task: taskColumns,
				assignee: {
					id: assignee.id,
					name: assignee.name,
					image: assignee.image,
				},
				creator: {
					id: creator.id,
					name: creator.name,
					image: creator.image,
				},
			})
			.from(tasks)
			.leftJoin(assignee, eq(tasks.assigneeId, assignee.id))
			.leftJoin(creator, eq(tasks.creatorId, creator.id))
			.where(
				and(eq(tasks.organizationId, organizationId), isNull(tasks.deletedAt)),
			)
			.orderBy(desc(tasks.createdAt));
	}),

	list: protectedProcedure
		.input(taskListInputSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const filters = buildTaskListFilters(
				organizationId,
				ctx.session.user.id,
				input,
			);

			return selectTaskListRows()
				.where(and(...filters))
				.orderBy(
					...buildTaskListOrderBy(
						input?.sortBy ?? undefined,
						input?.sortOrder ?? undefined,
					),
				)
				.limit(input?.limit ?? 50)
				.offset(input?.offset ?? 0);
		}),

	listPage: protectedProcedure
		.input(taskListPageInputSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const filters = buildTaskListFilters(
				organizationId,
				ctx.session.user.id,
				input,
			);

			if (input.cursor) {
				const { createdAt, id } = input.cursor;
				const keyset = or(
					lt(tasks.createdAt, createdAt),
					and(eq(tasks.createdAt, createdAt), lt(tasks.id, id)),
				);
				if (keyset) {
					filters.push(keyset);
				}
			}

			const rows = await selectTaskListRows()
				.where(and(...filters))
				.orderBy(desc(taskCreatedAtSortKey), desc(tasks.id))
				.limit(input.limit + 1);

			const items = rows.slice(0, input.limit);
			const last = items.at(-1);
			const nextCursor =
				rows.length > input.limit && last
					? { createdAt: last.task.createdAt, id: last.task.id }
					: null;

			return { items, nextCursor };
		}),

	byOrganization: protectedProcedure
		.input(z.string().uuid())
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input);

			return db
				.select(taskColumns)
				.from(tasks)
				.where(and(eq(tasks.organizationId, input), isNull(tasks.deletedAt)))
				.orderBy(desc(tasks.createdAt));
		}),

	byId: protectedProcedure
		.input(z.string().uuid())
		.query(({ ctx, input }) => getTaskById(ctx.session.user.id, input)),

	bySlug: protectedProcedure.input(z.string()).query(async ({ ctx, input }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		return getTaskBySlug(ctx.session.user.id, organizationId, input);
	}),

	byIdOrSlug: protectedProcedure
		.input(z.string().min(1))
		.query(async ({ ctx, input }) => {
			const looksLikeUuid =
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
					input,
				);
			const task =
				(looksLikeUuid
					? await getTaskById(ctx.session.user.id, input)
					: null) ??
				(await getTaskBySlug(
					ctx.session.user.id,
					await requireActiveOrgMembership(ctx),
					input,
				));
			if (!task?.description) return task;
			return {
				...task,
				description: await toReadableDocument(task.description, {
					kind: "tasks",
					id: task.id,
				}),
			};
		}),

	/**
	 * @deprecated Use `task.create` instead. Kept for one release cycle so
	 * shipped renderer/CLI on `main` keep working during the CLI-v1 split
	 * rollout.
	 */
	createFromUi: protectedProcedure
		.input(createTaskSchema)
		.mutation(({ ctx, input }) => createTask(ctx, input)),

	create: protectedProcedure
		.input(createTaskSchema)
		.mutation(({ ctx, input }) => createTask(ctx, input)),

	importSource: protectedProcedure
		.input(z.string().uuid())
		.query(async ({ ctx, input }) => {
			await getTaskAccess(db, ctx.session.user.id, input);
			const [source] = await db
				.select({
					provider: taskImports.provider,
					externalUrl: taskImports.externalUrl,
				})
				.from(taskImports)
				.where(eq(taskImports.taskId, input))
				.limit(1);
			return source ?? null;
		}),

	importFromLinear: protectedProcedure
		.input(z.object({ issueId: z.string().min(1) }))
		.mutation(({ ctx, input }) => importLinearIssue(ctx, input.issueId)),

	/**
	 * Moves a task to the organization's first "started"-type status (e.g.
	 * "In Progress") when work begins on it — a workspace is created from it
	 * or an agent starts working. No-op unless the task is currently in a
	 * "backlog"/"unstarted" status, so it never regresses tasks that are
	 * already in progress or done. An unassigned task is assigned to the
	 * acting user; an existing assignee (internal or external snapshot) is
	 * never overwritten. Changes are pushed to the external provider
	 * (Linear) via the regular sync path.
	 */
	start: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const result = await dbWs.transaction(async (tx) => {
				const taskAccess = await getTaskAccess(
					tx,
					ctx.session.user.id,
					input.id,
				);

				const [current] = await tx
					.select({
						statusId: tasks.statusId,
						statusType: taskStatuses.type,
						statusProvider: taskStatuses.externalProvider,
						assigneeId: tasks.assigneeId,
						assigneeExternalId: tasks.assigneeExternalId,
					})
					.from(tasks)
					.innerJoin(taskStatuses, eq(tasks.statusId, taskStatuses.id))
					.where(and(eq(tasks.id, input.id), isNull(tasks.deletedAt)))
					.limit(1);

				if (
					!current ||
					(current.statusType !== "backlog" &&
						current.statusType !== "unstarted")
				) {
					return { task: null, txid: null };
				}

				// Stay within the status set the task already lives in (Linear
				// statuses vs local defaults) so the transition is meaningful
				// to the provider that owns the task's workflow.
				const [startedStatus] = await tx
					.select({ id: taskStatuses.id })
					.from(taskStatuses)
					.where(
						and(
							eq(taskStatuses.organizationId, taskAccess.organizationId),
							eq(taskStatuses.type, "started"),
							current.statusProvider
								? eq(taskStatuses.externalProvider, current.statusProvider)
								: isNull(taskStatuses.externalProvider),
						),
					)
					.orderBy(asc(taskStatuses.position))
					.limit(1);

				if (!startedStatus) {
					return { task: null, txid: null };
				}

				const unassigned =
					current.assigneeId === null && current.assigneeExternalId === null;

				// Compare-and-set on the observed status so a concurrent move to
				// completed/canceled between the read and this write is never
				// dragged back to started. No row updated = no-op.
				const [task] = await tx
					.update(tasks)
					.set({
						statusId: startedStatus.id,
						...(unassigned ? { assigneeId: ctx.session.user.id } : {}),
					})
					.where(
						and(
							eq(tasks.id, input.id),
							eq(tasks.statusId, current.statusId),
							isNull(tasks.deletedAt),
						),
					)
					.returning(taskColumns);

				if (!task) {
					return { task: null, txid: null };
				}

				await recordTaskActivity(
					tx,
					task.id,
					{ kind: "user", userId: ctx.session.user.id },
					diffTaskActivity(
						{
							...task,
							statusId: current.statusId,
							assigneeId: current.assigneeId,
						},
						task,
					),
				);

				const txid = await getCurrentTxid(tx);

				return { task, txid };
			});

			return result;
		}),

	update: protectedProcedure
		.input(updateTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, labels, ...data } = input;

			const result = await dbWs.transaction(async (tx) => {
				const taskAccess = await getTaskAccess(tx, ctx.session.user.id, id);
				const [before] = await tx
					.select({
						title: tasks.title,
						description: tasks.description,
						statusId: tasks.statusId,
						priority: tasks.priority,
						assigneeId: tasks.assigneeId,
					})
					.from(tasks)
					.where(eq(tasks.id, id));

				// Enforce assignee invariant: setting internal assignee clears external snapshot
				const updateData: Record<string, unknown> = { ...data };
				if (data.description) {
					updateData.description = toStoredDocument(data.description, {
						kind: "tasks",
						id,
					});
				}

				if (data.statusId) {
					updateData.statusId = await getScopedStatusId(
						tx,
						taskAccess.organizationId,
						data.statusId,
						"Status must belong to the task organization",
					);
				}

				if ("assigneeId" in data) {
					updateData.assigneeId = await getScopedAssigneeId(
						tx,
						taskAccess.organizationId,
						data.assigneeId ?? null,
						"Assignee must belong to the task organization",
					);
					updateData.assigneeExternalId = null;
					updateData.assigneeDisplayName = null;
					updateData.assigneeAvatarUrl = null;
				}

				const [updated] = await tx
					.update(tasks)
					.set({ ...updateData, updatedAt: new Date() })
					.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
					.returning();

				const labelChanges =
					updated && labels
						? await setTaskLabels(tx, {
								organizationId: taskAccess.organizationId,
								taskId: id,
								names: labels,
							})
						: null;

				if (before && updated) {
					await recordTaskActivity(
						tx,
						id,
						{ kind: "user", userId: ctx.session.user.id },
						[
							...diffTaskActivity(before, updated),
							...labelActivity(labelChanges),
						],
					);
				}

				const [task] = updated
					? await tx.select(taskColumns).from(tasks).where(eq(tasks.id, id))
					: [];

				const txid = await getCurrentTxid(tx);

				return { task, txid };
			});

			if (result.task) {
				const { id, organizationId, description } = result.task;
				if (description) {
					await anchorAttachments({
						parentKind: "issue",
						parentId: id,
						organizationId,
						fileIds: referencedFileIds(description, { kind: "tasks", id }),
					}).catch((error) => {
						console.error(
							`[task] could not keep the description's files for ${id}`,
							error,
						);
					});
				}
			}

			return result;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ ctx, input }) => {
			const result = await dbWs.transaction(async (tx) => {
				await getTaskAccess(tx, ctx.session.user.id, input);

				await tx
					.update(tasks)
					.set({ deletedAt: new Date() })
					.where(and(eq(tasks.id, input), isNull(tasks.deletedAt)));

				return { txid: await getCurrentTxid(tx) };
			});

			return { txid: result.txid };
		}),
} satisfies TRPCRouterRecord;
