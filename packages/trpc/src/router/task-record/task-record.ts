import { db, dbWs } from "@superset/db/client";
import {
	attachments,
	cloudWorkspaceActivity,
	cloudWorkspaces,
	taskActivity,
	taskComments,
	taskImports,
	taskLabelAssignments,
	taskLabels,
	taskProjects,
	taskProjectTasks,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { anchorAttachments } from "../../lib/attachments";
import { assertMember } from "../../lib/cloud-guards";
import {
	referencedFileIds,
	toReadableDocument,
	toStoredDocument,
} from "../../lib/document-files";
import {
	addTaskLabels,
	ensureLabels,
	removeTaskLabels,
} from "../../lib/labels";
import { jwtProcedure, userError } from "../../trpc";
import { visibleTo } from "../cloud-workspace/access";
import { labelActivity, recordTaskActivity } from "../task/activity";

const COMMENT_MAX_LENGTH = 20_000;

const notFound = () =>
	userError({
		code: "NOT_FOUND",
		message: "Task not found",
		i18nKey: "serverError.task.notFound",
	});

async function loadTask(ctx: { organizationIds: string[] }, taskId: string) {
	const task = await db.query.tasks.findFirst({
		where: and(eq(tasks.id, taskId), isNull(tasks.deletedAt)),
		columns: {
			id: true,
			organizationId: true,
			createdAt: true,
			creatorId: true,
		},
	});
	if (!task) throw notFound();
	assertMember(ctx.organizationIds, task.organizationId);
	return task;
}

async function loadOwnComment(
	ctx: { organizationIds: string[]; userId: string },
	commentId: string,
) {
	const comment = await db.query.taskComments.findFirst({
		where: eq(taskComments.id, commentId),
	});
	if (!comment) throw notFound();
	await loadTask(ctx, comment.taskId);
	if (comment.authorUserId !== ctx.userId) {
		throw userError({
			code: "FORBIDDEN",
			message: "Only the author can change a comment",
			i18nKey: "serverError.task.commentNotYours",
		});
	}
	return comment;
}

async function loadTaskLabels(taskId: string) {
	return db
		.select({
			id: taskLabels.id,
			name: taskLabels.name,
			color: taskLabels.color,
		})
		.from(taskLabelAssignments)
		.innerJoin(taskLabels, eq(taskLabels.id, taskLabelAssignments.labelId))
		.where(eq(taskLabelAssignments.taskId, taskId))
		.orderBy(asc(taskLabels.name));
}

export const taskRecordRouter = {
	/** Everything that happened to a task, oldest first, for the client to lay out. */
	timeline: jwtProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const task = await loadTask(ctx, input.taskId);
			const creator = task.creatorId
				? await db.query.users.findFirst({
						where: eq(users.id, task.creatorId),
						columns: { id: true, name: true, image: true },
					})
				: undefined;

			const actor = alias(users, "actor");
			const fromAssignee = alias(users, "from_assignee");
			const toAssignee = alias(users, "to_assignee");
			const fromStatus = alias(taskStatuses, "from_status");
			const toStatus = alias(taskStatuses, "to_status");
			const fromProject = alias(taskProjects, "from_project");
			const toProject = alias(taskProjects, "to_project");
			const changes = await db
				.select({
					entry: taskActivity,
					actor: { userId: actor.id, name: actor.name, image: actor.image },
					fromAssignee: {
						userId: fromAssignee.id,
						name: fromAssignee.name,
						image: fromAssignee.image,
					},
					toAssignee: {
						userId: toAssignee.id,
						name: toAssignee.name,
						image: toAssignee.image,
					},
					fromStatus: {
						id: fromStatus.id,
						name: fromStatus.name,
						type: fromStatus.type,
						color: fromStatus.color,
						progressPercent: fromStatus.progressPercent,
					},
					toStatus: {
						id: toStatus.id,
						name: toStatus.name,
						type: toStatus.type,
						color: toStatus.color,
						progressPercent: toStatus.progressPercent,
					},
					fromProject: {
						id: fromProject.id,
						name: fromProject.name,
						icon: fromProject.icon,
						color: fromProject.color,
					},
					toProject: {
						id: toProject.id,
						name: toProject.name,
						icon: toProject.icon,
						color: toProject.color,
					},
				})
				.from(taskActivity)
				.leftJoin(actor, eq(actor.id, taskActivity.actorUserId))
				.leftJoin(
					fromAssignee,
					eq(fromAssignee.id, taskActivity.fromAssigneeId),
				)
				.leftJoin(toAssignee, eq(toAssignee.id, taskActivity.toAssigneeId))
				.leftJoin(fromStatus, eq(fromStatus.id, taskActivity.fromStatusId))
				.leftJoin(toStatus, eq(toStatus.id, taskActivity.toStatusId))
				.leftJoin(fromProject, eq(fromProject.id, taskActivity.fromProjectId))
				.leftJoin(toProject, eq(toProject.id, taskActivity.toProjectId))
				.where(eq(taskActivity.taskId, task.id))
				.orderBy(asc(taskActivity.createdAt));

			const labelIds = [
				...new Set(
					changes.flatMap(({ entry }) => [
						...(entry.addedLabelIds ?? []),
						...(entry.removedLabelIds ?? []),
					]),
				),
			];
			const labelRows = labelIds.length
				? await db
						.select({
							id: taskLabels.id,
							name: taskLabels.name,
							color: taskLabels.color,
						})
						.from(taskLabels)
						.where(inArray(taskLabels.id, labelIds))
				: [];
			const labelById = new Map(labelRows.map((label) => [label.id, label]));
			const resolveLabels = (ids: string[] | null) =>
				(ids ?? []).flatMap((id) => {
					const label = labelById.get(id);
					return label ? [label] : [];
				});

			const linker = alias(users, "linker");
			const workspaceLinks = await db
				.select({
					id: cloudWorkspaceActivity.id,
					at: cloudWorkspaceActivity.createdAt,
					linkedTaskId: cloudWorkspaceActivity.linkedTaskId,
					actor: { userId: linker.id, name: linker.name, image: linker.image },
					workspace: { id: cloudWorkspaces.id, name: cloudWorkspaces.name },
				})
				.from(cloudWorkspaceActivity)
				.innerJoin(
					cloudWorkspaces,
					eq(cloudWorkspaces.id, cloudWorkspaceActivity.cloudWorkspaceId),
				)
				.leftJoin(linker, eq(linker.id, cloudWorkspaceActivity.actorUserId))
				.where(
					and(
						or(
							eq(cloudWorkspaceActivity.linkedTaskId, task.id),
							eq(cloudWorkspaceActivity.unlinkedTaskId, task.id),
						),
						visibleTo(ctx.userId),
					),
				)
				.orderBy(asc(cloudWorkspaceActivity.createdAt));

			const author = alias(users, "author");
			const comments = await db
				.select({
					id: taskComments.id,
					at: taskComments.createdAt,
					editedAt: taskComments.editedAt,
					parentCommentId: taskComments.parentCommentId,
					body: taskComments.body,
					author: { userId: author.id, name: author.name, image: author.image },
				})
				.from(taskComments)
				.leftJoin(author, eq(author.id, taskComments.authorUserId))
				.where(eq(taskComments.taskId, task.id))
				.orderBy(asc(taskComments.createdAt));

			const imports = await db
				.select({ provider: taskImports.provider })
				.from(taskImports)
				.where(eq(taskImports.taskId, task.id))
				.limit(1);

			return {
				created: {
					at: task.createdAt,
					importedFrom: imports.at(0)?.provider ?? null,
					actor: creator
						? { userId: creator.id, name: creator.name, image: creator.image }
						: null,
				},
				changes: changes.map((row) => ({
					id: row.entry.id,
					at: row.entry.createdAt,
					actor: row.actor?.userId ? row.actor : null,
					title:
						row.entry.toTitle !== null
							? { from: row.entry.fromTitle ?? "", to: row.entry.toTitle }
							: null,
					descriptionEdited: row.entry.descriptionEdited,
					addedLabels: resolveLabels(row.entry.addedLabelIds),
					removedLabels: resolveLabels(row.entry.removedLabelIds),
					status:
						row.entry.toStatusId !== null || row.entry.fromStatusId !== null
							? {
									from: row.fromStatus?.id ? row.fromStatus : null,
									to: row.toStatus?.id ? row.toStatus : null,
								}
							: null,
					priority:
						row.entry.toPriority !== null
							? { from: row.entry.fromPriority, to: row.entry.toPriority }
							: null,
					assignee:
						row.entry.fromAssigneeId !== null || row.entry.toAssigneeId !== null
							? {
									from: row.fromAssignee?.userId ? row.fromAssignee : null,
									to: row.toAssignee?.userId ? row.toAssignee : null,
								}
							: null,
					project:
						row.entry.fromProjectId !== null || row.entry.toProjectId !== null
							? {
									from: row.fromProject?.id ? row.fromProject : null,
									to: row.toProject?.id ? row.toProject : null,
								}
							: null,
				})),
				workspaceLinks: workspaceLinks.map((row) => ({
					id: row.id,
					at: row.at,
					kind:
						row.linkedTaskId === task.id
							? ("linked" as const)
							: ("unlinked" as const),
					actor: row.actor?.userId ? row.actor : null,
					workspace: row.workspace,
				})),
				comments: await Promise.all(
					comments.map(async (comment) => ({
						...comment,
						body: await toReadableDocument(comment.body, {
							kind: "tasks",
							id: task.id,
						}),
						author: comment.author?.userId ? comment.author : null,
					})),
				),
			};
		}),

	/** The project a task belongs to, if any. */
	project: jwtProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const task = await loadTask(ctx, input.taskId);
			const rows = await db
				.select({
					id: taskProjects.id,
					name: taskProjects.name,
					icon: taskProjects.icon,
					color: taskProjects.color,
				})
				.from(taskProjectTasks)
				.innerJoin(
					taskProjects,
					eq(taskProjects.id, taskProjectTasks.projectId),
				)
				.where(eq(taskProjectTasks.taskId, task.id));
			return rows.at(0) ?? null;
		}),

	labels: jwtProcedure
		.input(z.object({ taskId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const task = await loadTask(ctx, input.taskId);
			return loadTaskLabels(task.id);
		}),

	/** Adds a label by name, creating it in the organization when it is new. */
	addLabel: jwtProcedure
		.input(z.object({ taskId: z.string().uuid(), name: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const task = await loadTask(ctx, input.taskId);
			const [label] = await ensureLabels(db, task.organizationId, [input.name]);
			if (!label) {
				throw userError({
					code: "BAD_REQUEST",
					message: "Invalid label",
					i18nKey: "serverError.task.invalidLabel",
				});
			}
			const added = await addTaskLabels(db, task.id, [label.id]);
			await recordTaskActivity(
				db,
				task.id,
				{ kind: "user", userId: ctx.userId },
				labelActivity({ added, removed: [] }),
			);
			return { labelId: label.id };
		}),

	removeLabel: jwtProcedure
		.input(z.object({ taskId: z.string().uuid(), labelId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const task = await loadTask(ctx, input.taskId);
			const removed = await removeTaskLabels(db, task.id, [input.labelId]);
			await recordTaskActivity(
				db,
				task.id,
				{ kind: "user", userId: ctx.userId },
				labelActivity({ added: [], removed }),
			);
			return { removed: removed.length > 0 };
		}),

	addComment: jwtProcedure
		.input(
			z.object({
				taskId: z.string().uuid(),
				parentCommentId: z.string().uuid().optional(),
				body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const task = await loadTask(ctx, input.taskId);
			const parent = input.parentCommentId
				? await db.query.taskComments.findFirst({
						where: and(
							eq(taskComments.id, input.parentCommentId),
							eq(taskComments.taskId, task.id),
						),
						columns: { id: true, parentCommentId: true },
					})
				: undefined;
			if (input.parentCommentId && !parent) throw notFound();
			const [comment] = await db
				.insert(taskComments)
				.values({
					taskId: task.id,
					parentCommentId: parent
						? (parent.parentCommentId ?? parent.id)
						: null,
					authorUserId: ctx.userId,
					body: toStoredDocument(input.body, { kind: "tasks", id: task.id }),
				})
				.returning();
			if (!comment) throw notFound();
			await anchorAttachments({
				parentKind: "task_comment",
				parentId: comment.id,
				organizationId: task.organizationId,
				fileIds: referencedFileIds(comment.body, {
					kind: "tasks",
					id: task.id,
				}),
			}).catch((error) => {
				console.error(
					`[task-record] could not keep the comment's files for ${comment.id}`,
					error,
				);
			});
			return { id: comment.id, at: comment.createdAt };
		}),

	editComment: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				body: z.string().trim().min(1).max(COMMENT_MAX_LENGTH),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const comment = await loadOwnComment(ctx, input.id);
			const scope = { kind: "tasks" as const, id: comment.taskId };
			const body = toStoredDocument(input.body, scope);
			const editedAt = new Date();
			await db
				.update(taskComments)
				.set({ body, editedAt })
				.where(eq(taskComments.id, comment.id));
			const task = await loadTask(ctx, comment.taskId);
			await anchorAttachments({
				parentKind: "task_comment",
				parentId: comment.id,
				organizationId: task.organizationId,
				fileIds: referencedFileIds(body, scope),
			}).catch((error) => {
				console.error(
					`[task-record] could not keep the comment's files for ${comment.id}`,
					error,
				);
			});
			return { editedAt };
		}),

	deleteComment: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const comment = await loadOwnComment(ctx, input.id);
			await dbWs.transaction(async (tx) => {
				const thread = await tx
					.select({ id: taskComments.id })
					.from(taskComments)
					.where(
						or(
							eq(taskComments.id, comment.id),
							eq(taskComments.parentCommentId, comment.id),
						),
					);
				await tx.delete(attachments).where(
					and(
						eq(attachments.parentKind, "task_comment"),
						inArray(
							attachments.parentId,
							thread.map((row) => row.id),
						),
					),
				);
				await tx.delete(taskComments).where(eq(taskComments.id, comment.id));
			});
			return { deleted: true };
		}),
} satisfies TRPCRouterRecord;
