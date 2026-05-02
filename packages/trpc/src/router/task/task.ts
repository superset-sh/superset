import { db, dbWs } from "@superset/db/client";
import { members, taskStatuses, tasks, users } from "@superset/db/schema";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { getCurrentTxid } from "@superset/db/utils";
import {
	generateBaseTaskSlug,
	generateUniqueTaskSlug,
} from "@superset/shared/task-slug";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { syncTask } from "../../lib/integrations/sync";
import { protectedProcedure, type TRPCContext } from "../../trpc";
import { verifyOrgMembership } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";
import {
	requireOrgResourceAccess,
	requireOrgScopedResource,
} from "../utils/org-resource-access";
import {
	createTaskSchema,
	taskListInputSchema,
	updateTaskSchema,
} from "./schema";

const TASK_SLUG_CONSTRAINT = "tasks_org_slug_unique";
const TASK_SLUG_RETRY_LIMIT = 5;

function escapeLikePattern(value: string): string {
	return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}
type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof dbWs | DbWsTransaction;

function isConstraintError(error: unknown, constraint: string): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const maybeError = error as { code?: string; constraint?: string };
	return maybeError.code === "23505" && maybeError.constraint === constraint;
}

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
		.select()
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
		.select()
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
				.where(
					and(
						eq(members.organizationId, organizationId),
						eq(members.userId, assigneeId),
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

async function createTask(
	ctx: CreateTaskContext,
	input: z.infer<typeof createTaskSchema>,
) {
	const organizationId = await requireActiveOrgMembership(ctx);

	for (let attempt = 0; attempt < TASK_SLUG_RETRY_LIMIT; attempt += 1) {
		try {
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

				const baseSlug = generateBaseTaskSlug(input.title);
				const existingSlugs = await tx
					.select({ slug: tasks.slug })
					.from(tasks)
					.where(
						and(
							eq(tasks.organizationId, organizationId),
							ilike(tasks.slug, `${baseSlug}%`),
						),
					);
				const slug = generateUniqueTaskSlug(
					baseSlug,
					existingSlugs.map((task) => task.slug),
				);

				const [task] = await tx
					.insert(tasks)
					.values({
						slug,
						title: input.title,
						description: input.description ?? null,
						statusId,
						priority: input.priority ?? "none",
						organizationId,
						creatorId: ctx.session.user.id,
						assigneeId,
						estimate: input.estimate ?? null,
						dueDate: input.dueDate ?? null,
						labels: input.labels ?? [],
					})
					.returning();

				const txid = await getCurrentTxid(tx);

				return { task, txid };
			});

			if (result.task) {
				syncTask(result.task.id);
			}

			return result;
		} catch (error) {
			if (
				isConstraintError(error, TASK_SLUG_CONSTRAINT) &&
				attempt < TASK_SLUG_RETRY_LIMIT - 1
			) {
				continue;
			}

			throw error;
		}
	}

	throw new TRPCError({
		code: "CONFLICT",
		message: "Failed to generate a unique task slug",
	});
}

export const taskRouter = {
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
				task: tasks,
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

			const assignee = alias(users, "assignee");
			const creator = alias(users, "creator");
			const status = alias(taskStatuses, "status");

			const filters = [
				eq(tasks.organizationId, organizationId),
				isNull(tasks.deletedAt),
			];
			if (input?.priority) filters.push(eq(tasks.priority, input.priority));
			if (input?.statusId) filters.push(eq(tasks.statusId, input.statusId));
			if (input?.assigneeMe) {
				filters.push(eq(tasks.assigneeId, ctx.session.user.id));
			} else if (input?.assigneeId) {
				filters.push(eq(tasks.assigneeId, input.assigneeId));
			}
			if (input?.creatorMe) {
				filters.push(eq(tasks.creatorId, ctx.session.user.id));
			}
			if (input?.search) {
				filters.push(
					ilike(tasks.title, `%${escapeLikePattern(input.search)}%`),
				);
			}

			return db
				.select({
					task: tasks,
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
				.leftJoin(status, eq(tasks.statusId, status.id))
				.where(and(...filters))
				.orderBy(desc(tasks.createdAt))
				.limit(input?.limit ?? 50)
				.offset(input?.offset ?? 0);
		}),

	byOrganization: protectedProcedure
		.input(z.string().uuid())
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input);

			return db
				.select()
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
			if (looksLikeUuid) {
				const task = await getTaskById(ctx.session.user.id, input);
				if (task) return task;
			}
			const organizationId = await requireActiveOrgMembership(ctx);
			return getTaskBySlug(ctx.session.user.id, organizationId, input);
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

	update: protectedProcedure
		.input(updateTaskSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;

			const result = await dbWs.transaction(async (tx) => {
				const taskAccess = await getTaskAccess(tx, ctx.session.user.id, id);

				// Enforce assignee invariant: setting internal assignee clears external snapshot
				const updateData: Record<string, unknown> = { ...data };

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

				const [task] = await tx
					.update(tasks)
					.set(updateData)
					.where(and(eq(tasks.id, id), isNull(tasks.deletedAt)))
					.returning();

				const txid = await getCurrentTxid(tx);

				return { task, txid };
			});

			if (result.task) {
				syncTask(result.task.id);
			}

			return result;
		}),

	delete: protectedProcedure
		.input(z.string().uuid())
		.mutation(async ({ ctx, input }) => {
			const result = await dbWs.transaction(async (tx) => {
				await getTaskAccess(tx, ctx.session.user.id, input);

				const [deleted] = await tx
					.update(tasks)
					.set({ deletedAt: new Date() })
					.where(and(eq(tasks.id, input), isNull(tasks.deletedAt)))
					.returning({
						externalProvider: tasks.externalProvider,
						externalId: tasks.externalId,
					});

				const txid = await getCurrentTxid(tx);

				return { txid, deleted };
			});

			if (result.deleted?.externalProvider && result.deleted?.externalId) {
				syncTask(input);
			}

			return { txid: result.txid };
		}),
} satisfies TRPCRouterRecord;
