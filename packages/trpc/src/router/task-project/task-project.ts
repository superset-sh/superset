import { db } from "@superset/db/client";
import {
	cloudWorkspaces,
	members,
	taskProjectStateValues,
	taskProjects,
	taskProjectTasks,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { pickEntityColor } from "@superset/shared/entity-colors";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { anchorAttachments } from "../../lib/attachments";
import { assertMember } from "../../lib/cloud-guards";
import {
	referencedFileIds,
	toReadableDocument,
	toStoredDocument,
} from "../../lib/document-files";
import { nudge } from "../../lib/realtime";
import { jwtProcedure } from "../../trpc";
import {
	assertTaskInOrganization,
	taskColumns,
	toTaskChip,
} from "../cloud-workspace/record";
import { recordTaskActivity } from "../task/activity";

/** A name from the desktop's project icon set, e.g. "airplane". */
const PROJECT_DESCRIPTION_MAX = 100_000;
const projectDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const projectIcon = z.string().regex(/^[a-z0-9-]{1,64}$/);
const projectColor = z.string().regex(/^#[0-9a-f]{6}$/i);

async function assertLeadIsMember(organizationId: string, userId: string) {
	const lead = await db.query.members.findFirst({
		where: and(
			eq(members.organizationId, organizationId),
			eq(members.userId, userId),
		),
		columns: { id: true },
	});
	if (!lead) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Lead is not a member of this organization",
		});
	}
}

async function loadProject(ctx: { organizationIds: string[] }, id: string) {
	const project = await db.query.taskProjects.findFirst({
		where: eq(taskProjects.id, id),
	});
	if (!project) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
	assertMember(ctx.organizationIds, project.organizationId);
	return project;
}

/** A task imported from Linear can be assigned to someone with no Superset account. */
function toAssignee(task: {
	assigneeId: string | null;
	assigneeName: string | null;
	assigneeImage: string | null;
	assigneeExternalId: string | null;
	assigneeDisplayName: string | null;
	assigneeAvatarUrl: string | null;
}) {
	if (task.assigneeId && task.assigneeName) {
		return {
			id: task.assigneeId,
			name: task.assigneeName,
			image: task.assigneeImage,
		};
	}
	if (task.assigneeExternalId && task.assigneeDisplayName) {
		return {
			id: task.assigneeExternalId,
			name: task.assigneeDisplayName,
			image: task.assigneeAvatarUrl,
		};
	}
	return null;
}

export const taskProjectRouter = {
	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			const workspaceCounts = db
				.select({
					projectId: cloudWorkspaces.projectId,
					workspaceCount: count().as("workspace_count"),
				})
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						isNull(cloudWorkspaces.archivedAt),
					),
				)
				.groupBy(cloudWorkspaces.projectId)
				.as("workspace_counts");
			const taskCounts = db
				.select({
					projectId: taskProjectTasks.projectId,
					taskCount: count().as("task_count"),
				})
				.from(taskProjectTasks)
				.innerJoin(tasks, eq(tasks.id, taskProjectTasks.taskId))
				.where(
					and(
						eq(tasks.organizationId, input.organizationId),
						isNull(tasks.deletedAt),
					),
				)
				.groupBy(taskProjectTasks.projectId)
				.as("task_counts");
			const rows = await db
				.select({
					id: taskProjects.id,
					name: taskProjects.name,
					icon: taskProjects.icon,
					color: taskProjects.color,
					state: taskProjects.state,
					targetDate: taskProjects.targetDate,
					createdAt: taskProjects.createdAt,
					lead: { userId: users.id, name: users.name, image: users.image },
					workspaceCount: workspaceCounts.workspaceCount,
					taskCount: taskCounts.taskCount,
				})
				.from(taskProjects)
				.leftJoin(users, eq(users.id, taskProjects.leadUserId))
				.leftJoin(
					workspaceCounts,
					eq(workspaceCounts.projectId, taskProjects.id),
				)
				.leftJoin(taskCounts, eq(taskCounts.projectId, taskProjects.id))
				.where(eq(taskProjects.organizationId, input.organizationId))
				.orderBy(asc(taskProjects.name));
			return rows.map((row) => ({
				...row,
				lead: row.lead?.userId ? row.lead : null,
				workspaceCount: row.workspaceCount ?? 0,
				taskCount: row.taskCount ?? 0,
			}));
		}),

	/** One project with its tasks; its cloud workspaces come from the cloud workspace list. */
	get: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const project = await loadProject(ctx, input.id);
			const [lead, projectTasks] = await Promise.all([
				project.leadUserId
					? db.query.users.findFirst({
							where: eq(users.id, project.leadUserId),
							columns: { id: true, name: true, image: true },
						})
					: undefined,
				db
					.select({
						...taskColumns,
						assigneeId: tasks.assigneeId,
						assigneeName: users.name,
						assigneeImage: users.image,
						assigneeExternalId: tasks.assigneeExternalId,
						assigneeDisplayName: tasks.assigneeDisplayName,
						assigneeAvatarUrl: tasks.assigneeAvatarUrl,
					})
					.from(taskProjectTasks)
					.innerJoin(tasks, eq(tasks.id, taskProjectTasks.taskId))
					.leftJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
					.leftJoin(users, eq(users.id, tasks.assigneeId))
					.where(
						and(
							eq(taskProjectTasks.projectId, project.id),
							isNull(tasks.deletedAt),
						),
					)
					.orderBy(desc(taskProjectTasks.createdAt)),
			]);
			return {
				id: project.id,
				name: project.name,
				description: project.description
					? await toReadableDocument(project.description, {
							kind: "projects",
							id: project.id,
						})
					: null,
				icon: project.icon,
				color: project.color,
				state: project.state,
				startDate: project.startDate,
				targetDate: project.targetDate,
				createdAt: project.createdAt,
				lead: lead ?? null,
				tasks: projectTasks.map((task) => ({
					...toTaskChip(task),
					assignee: toAssignee(task),
				})),
			};
		}),

	/** A task belongs to one project; adding it here moves it from any other. */
	addTask: jwtProcedure
		.input(z.object({ id: z.string().uuid(), taskId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const project = await loadProject(ctx, input.id);
			await assertTaskInOrganization(input.taskId, project.organizationId);
			const previous = await db.query.taskProjectTasks.findFirst({
				where: eq(taskProjectTasks.taskId, input.taskId),
				columns: { projectId: true },
			});
			await db
				.insert(taskProjectTasks)
				.values({ projectId: project.id, taskId: input.taskId })
				.onConflictDoUpdate({
					target: taskProjectTasks.taskId,
					set: { projectId: project.id, createdAt: new Date() },
				});
			if (previous?.projectId !== project.id) {
				await recordTaskActivity(
					db,
					input.taskId,
					{ kind: "user", userId: ctx.userId },
					[
						{
							fromProjectId: previous?.projectId ?? null,
							toProjectId: project.id,
						},
					],
				);
			}
			nudge(project.organizationId, "cloud_workspaces");
			return { added: true };
		}),

	removeTask: jwtProcedure
		.input(z.object({ id: z.string().uuid(), taskId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const project = await loadProject(ctx, input.id);
			const [removed] = await db
				.delete(taskProjectTasks)
				.where(
					and(
						eq(taskProjectTasks.projectId, project.id),
						eq(taskProjectTasks.taskId, input.taskId),
					),
				)
				.returning({ taskId: taskProjectTasks.taskId });
			if (removed) {
				await recordTaskActivity(
					db,
					input.taskId,
					{ kind: "user", userId: ctx.userId },
					[{ fromProjectId: project.id, toProjectId: null }],
				);
			}
			nudge(project.organizationId, "cloud_workspaces");
			return { removed: true };
		}),

	create: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				name: z.string().trim().min(1).max(120),
				color: projectColor.nullable().optional(),
				state: z.enum(taskProjectStateValues).optional(),
				icon: projectIcon.nullable().optional(),
				description: z
					.string()
					.trim()
					.max(PROJECT_DESCRIPTION_MAX)
					.nullable()
					.optional(),
				leadUserId: z.string().uuid().nullable().optional(),
				startDate: projectDate.nullable().optional(),
				targetDate: projectDate.nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertMember(ctx.organizationIds, input.organizationId);
			const leadUserId =
				input.leadUserId === undefined ? ctx.userId : input.leadUserId;
			if (leadUserId && leadUserId !== ctx.userId) {
				await assertLeadIsMember(input.organizationId, leadUserId);
			}
			const [project] = await db
				.insert(taskProjects)
				.values({
					organizationId: input.organizationId,
					name: input.name,
					color: input.color === undefined ? pickEntityColor() : input.color,
					state: input.state,
					icon: input.icon ?? null,
					description: input.description || null,
					leadUserId,
					startDate: input.startDate ?? null,
					targetDate: input.targetDate ?? null,
				})
				.returning({
					id: taskProjects.id,
					name: taskProjects.name,
					icon: taskProjects.icon,
					color: taskProjects.color,
					state: taskProjects.state,
				});
			return project;
		}),

	update: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				name: z.string().trim().min(1).max(120).optional(),
				icon: projectIcon.nullable().optional(),
				color: projectColor.nullable().optional(),
				state: z.enum(taskProjectStateValues).optional(),
				description: z
					.string()
					.trim()
					.max(PROJECT_DESCRIPTION_MAX)
					.nullable()
					.optional(),
				leadUserId: z.string().uuid().nullable().optional(),
				startDate: projectDate.nullable().optional(),
				targetDate: projectDate.nullable().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const project = await loadProject(ctx, input.id);
			if (input.leadUserId) {
				await assertLeadIsMember(project.organizationId, input.leadUserId);
			}
			const { id, ...changes } = input;
			const scope = { kind: "projects" as const, id };
			const description = changes.description
				? toStoredDocument(changes.description, scope)
				: changes.description;
			await db
				.update(taskProjects)
				.set({ ...changes, description })
				.where(eq(taskProjects.id, id));
			if (description) {
				await anchorAttachments({
					parentKind: "project_description",
					parentId: id,
					organizationId: project.organizationId,
					fileIds: referencedFileIds(description, scope),
				}).catch((error) => {
					console.error(
						`[task-project] could not keep the description's files for ${id}`,
						error,
					);
				});
			}
			nudge(project.organizationId, "cloud_workspaces");
			return { id };
		}),
} satisfies TRPCRouterRecord;
