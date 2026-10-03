import { db } from "@superset/db/client";
import {
	cloudWorkspaceActivity,
	cloudWorkspaceLabels,
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	cloudWorkspaceTasks,
	environments,
	githubRepositories,
	pages,
	type SelectTask,
	suggestions,
	taskLabels,
	taskProjects,
	taskStatuses,
	tasks,
	users,
} from "@superset/db/schema";
import { LABELS_MAX_PER_WORKSPACE } from "@superset/shared/labels";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { anchorAttachments, loadAttachments } from "../../lib/attachments";
import { assertCloudAccess, assertMember } from "../../lib/cloud-guards";
import { ensureLabels } from "../../lib/labels";
import { nudge } from "../../lib/realtime";
import { primaryRepository } from "../../lib/sandbox";
import { jwtProcedure } from "../../trpc";
import { loadVisibleWorkspace, visibleTo } from "./access";
import { recordCloudWorkspaceActivity } from "./activity";

const DESCRIPTION_MAX_LENGTH = 20_000;

export const taskColumns = {
	id: tasks.id,
	slug: tasks.slug,
	externalProvider: tasks.externalProvider,
	externalKey: tasks.externalKey,
	title: tasks.title,
	statusType: taskStatuses.type,
	statusColor: taskStatuses.color,
	progressPercent: taskStatuses.progressPercent,
};

type TaskColumns = {
	id: string;
	slug: string;
	externalProvider: SelectTask["externalProvider"];
	externalKey: string | null;
	title: string;
	statusType: string | null;
	statusColor: string | null;
	progressPercent: number | null;
};

export function toTaskChip(row: TaskColumns) {
	return {
		id: row.id,
		slug: row.slug,
		externalProvider: row.externalProvider,
		externalKey: row.externalKey,
		title: row.title,
		status:
			row.statusType && row.statusColor
				? {
						type: row.statusType,
						color: row.statusColor,
						progressPercent: row.progressPercent,
					}
				: null,
	};
}

async function loadLinkedTasks(workspaceIds: string[]) {
	if (workspaceIds.length === 0) return [];
	const rows = await db
		.select({
			cloudWorkspaceId: cloudWorkspaceTasks.cloudWorkspaceId,
			...taskColumns,
		})
		.from(cloudWorkspaceTasks)
		.innerJoin(tasks, eq(tasks.id, cloudWorkspaceTasks.taskId))
		.leftJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
		.where(
			and(
				inArray(cloudWorkspaceTasks.cloudWorkspaceId, workspaceIds),
				isNull(tasks.deletedAt),
			),
		)
		.orderBy(asc(cloudWorkspaceTasks.createdAt));
	return rows.map(({ cloudWorkspaceId, ...task }) => ({
		cloudWorkspaceId,
		task: toTaskChip(task),
	}));
}

async function loadLabels(cloudWorkspaceId: string) {
	return db
		.select({
			id: taskLabels.id,
			name: taskLabels.name,
			color: taskLabels.color,
		})
		.from(cloudWorkspaceLabels)
		.innerJoin(taskLabels, eq(taskLabels.id, cloudWorkspaceLabels.labelId))
		.where(eq(cloudWorkspaceLabels.cloudWorkspaceId, cloudWorkspaceId))
		.orderBy(asc(taskLabels.name));
}

export async function assertTaskInOrganization(
	taskId: string,
	organizationId: string,
) {
	const task = await db.query.tasks.findFirst({
		where: and(
			eq(tasks.id, taskId),
			eq(tasks.organizationId, organizationId),
			isNull(tasks.deletedAt),
		),
		columns: { id: true },
	});
	if (!task) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
	}
}

/** Links a task to a box once; true when this call made the link. */
export async function linkTask(args: {
	cloudWorkspaceId: string;
	taskId: string;
	actor: { kind: "user"; userId: string } | { kind: "system" };
	suggestionId?: string;
}) {
	const [linked] = await db
		.insert(cloudWorkspaceTasks)
		.values({
			cloudWorkspaceId: args.cloudWorkspaceId,
			taskId: args.taskId,
			linkedByKind: args.actor.kind,
			linkedByUserId: args.actor.kind === "user" ? args.actor.userId : null,
		})
		.onConflictDoNothing()
		.returning({ taskId: cloudWorkspaceTasks.taskId });
	if (!linked) return false;
	await recordCloudWorkspaceActivity(db, args.cloudWorkspaceId, args.actor, {
		linkedTaskId: args.taskId,
		suggestionId: args.suggestionId,
	});
	return true;
}

export async function setProject(args: {
	row: typeof cloudWorkspaces.$inferSelect;
	projectId: string | null;
	userId: string;
	suggestionId?: string;
}) {
	if (args.projectId) {
		const project = await db.query.taskProjects.findFirst({
			where: and(
				eq(taskProjects.id, args.projectId),
				eq(taskProjects.organizationId, args.row.organizationId),
			),
			columns: { id: true },
		});
		if (!project) {
			throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
		}
	}
	if (args.projectId === args.row.projectId) return;
	await db
		.update(cloudWorkspaces)
		.set({ projectId: args.projectId })
		.where(eq(cloudWorkspaces.id, args.row.id));
	await recordCloudWorkspaceActivity(
		db,
		args.row.id,
		{ kind: "user", userId: args.userId },
		{
			fromProjectId: args.row.projectId,
			toProjectId: args.projectId,
			suggestionId: args.suggestionId,
		},
	);
}

export async function addLabel(args: {
	row: typeof cloudWorkspaces.$inferSelect;
	labelId: string;
	userId: string;
	suggestionId?: string;
}) {
	const labelCount = await db.$count(
		cloudWorkspaceLabels,
		eq(cloudWorkspaceLabels.cloudWorkspaceId, args.row.id),
	);
	if (labelCount >= LABELS_MAX_PER_WORKSPACE) {
		throw new TRPCError({ code: "BAD_REQUEST", message: "Too many labels" });
	}
	const [added] = await db
		.insert(cloudWorkspaceLabels)
		.values({ cloudWorkspaceId: args.row.id, labelId: args.labelId })
		.onConflictDoNothing()
		.returning({ labelId: cloudWorkspaceLabels.labelId });
	if (!added) return;
	await recordCloudWorkspaceActivity(
		db,
		args.row.id,
		{ kind: "user", userId: args.userId },
		{ addedLabelIds: [args.labelId], suggestionId: args.suggestionId },
	);
}

export const cloudWorkspaceRecordRouter = {
	/** One box in any state, archived included, with what its record page shows. */
	get: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [creator, environment, repositories, linked, labels, project] =
				await Promise.all([
					row.createdByUserId
						? db.query.users.findFirst({
								where: eq(users.id, row.createdByUserId),
								columns: { id: true, name: true, image: true },
							})
						: undefined,
					db.query.environments.findFirst({
						where: eq(environments.id, row.environmentId),
						columns: { id: true, name: true, hooksRepositoryId: true },
					}),
					db
						.select({
							id: githubRepositories.id,
							fullName: githubRepositories.fullName,
						})
						.from(cloudWorkspaceRepositories)
						.innerJoin(
							githubRepositories,
							eq(
								githubRepositories.id,
								cloudWorkspaceRepositories.repositoryId,
							),
						)
						.where(eq(cloudWorkspaceRepositories.cloudWorkspaceId, row.id))
						.orderBy(asc(githubRepositories.fullName)),
					loadLinkedTasks([row.id]),
					loadLabels(row.id),
					row.projectId
						? db.query.taskProjects.findFirst({
								where: eq(taskProjects.id, row.projectId),
								columns: { id: true, name: true, icon: true, color: true },
							})
						: undefined,
				]);
			const primary = primaryRepository(
				repositories,
				environment?.hooksRepositoryId,
			);
			const orderedRepositories = primary
				? [primary, ...repositories.filter((repo) => repo.id !== primary.id)]
				: repositories;
			return {
				id: row.id,
				organizationId: row.organizationId,
				name: row.name,
				branch: row.branch,
				status: row.status,
				visibility: row.visibility,
				agentStatus: row.agentStatus,
				agentStatusAt: row.agentStatusAt,
				prompt: row.prompt,
				description: row.description,
				createdAt: row.createdAt,
				deletedAt: row.deletedAt,
				createdBy: creator
					? { userId: creator.id, name: creator.name, image: creator.image }
					: null,
				environment: environment
					? { id: environment.id, name: environment.name }
					: null,
				repositories: orderedRepositories.map((repo) => ({
					fullName: repo.fullName,
					branch: row.branch,
				})),
				tasks: linked.map((link) => link.task),
				labels,
				project: project ?? null,
				attachments:
					(await loadAttachments("cloud_workspace", [row.id])).get(row.id) ??
					[],
			};
		}),

	/** The box's timeline, oldest first, with the names each entry refers to. */
	activity: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const linkedTask = alias(tasks, "linked_task");
			const unlinkedTask = alias(tasks, "unlinked_task");
			const linkedStatus = alias(taskStatuses, "linked_status");
			const unlinkedStatus = alias(taskStatuses, "unlinked_status");
			const fromProject = alias(taskProjects, "from_project");
			const toProject = alias(taskProjects, "to_project");
			const proposer = alias(users, "proposer");
			const rows = await db
				.select({
					entry: cloudWorkspaceActivity,
					actor: { userId: users.id, name: users.name, image: users.image },
					linkedTask: {
						id: linkedTask.id,
						slug: linkedTask.slug,
						externalProvider: linkedTask.externalProvider,
						externalKey: linkedTask.externalKey,
						title: linkedTask.title,
						statusType: linkedStatus.type,
						statusColor: linkedStatus.color,
						progressPercent: linkedStatus.progressPercent,
					},
					unlinkedTask: {
						id: unlinkedTask.id,
						slug: unlinkedTask.slug,
						externalProvider: unlinkedTask.externalProvider,
						externalKey: unlinkedTask.externalKey,
						title: unlinkedTask.title,
						statusType: unlinkedStatus.type,
						statusColor: unlinkedStatus.color,
						progressPercent: unlinkedStatus.progressPercent,
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
					page: { id: pages.id, title: pages.title },
					suggestion: { source: suggestions.source },
					suggestedBy: {
						userId: proposer.id,
						name: proposer.name,
						image: proposer.image,
					},
				})
				.from(cloudWorkspaceActivity)
				.leftJoin(users, eq(users.id, cloudWorkspaceActivity.actorUserId))
				.leftJoin(
					linkedTask,
					eq(linkedTask.id, cloudWorkspaceActivity.linkedTaskId),
				)
				.leftJoin(linkedStatus, eq(linkedStatus.id, linkedTask.statusId))
				.leftJoin(
					unlinkedTask,
					eq(unlinkedTask.id, cloudWorkspaceActivity.unlinkedTaskId),
				)
				.leftJoin(unlinkedStatus, eq(unlinkedStatus.id, unlinkedTask.statusId))
				.leftJoin(
					fromProject,
					eq(fromProject.id, cloudWorkspaceActivity.fromProjectId),
				)
				.leftJoin(
					toProject,
					eq(toProject.id, cloudWorkspaceActivity.toProjectId),
				)
				.leftJoin(pages, eq(pages.id, cloudWorkspaceActivity.pageId))
				.leftJoin(
					suggestions,
					eq(suggestions.id, cloudWorkspaceActivity.suggestionId),
				)
				.leftJoin(proposer, eq(proposer.id, suggestions.proposedByUserId))
				.where(eq(cloudWorkspaceActivity.cloudWorkspaceId, row.id))
				.orderBy(asc(cloudWorkspaceActivity.createdAt));

			const labelIds = [
				...new Set(
					rows.flatMap(({ entry }) => [
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

			const entries = rows.map((row) => ({
				id: row.entry.id,
				at: row.entry.createdAt,
				actor:
					row.entry.actorKind === "user" && row.actor
						? { kind: "user" as const, person: row.actor }
						: { kind: "system" as const },
				event: row.entry.event,
				fromName: row.entry.fromName,
				toName: row.entry.toName,
				fromVisibility: row.entry.fromVisibility,
				toVisibility: row.entry.toVisibility,
				fromProject: row.fromProject?.id ? row.fromProject : null,
				toProject: row.toProject?.id ? row.toProject : null,
				addedLabels: resolveLabels(row.entry.addedLabelIds),
				removedLabels: resolveLabels(row.entry.removedLabelIds),
				linkedTask: row.linkedTask?.id
					? toTaskChip(row.linkedTask as TaskColumns)
					: null,
				unlinkedTask: row.unlinkedTask?.id
					? toTaskChip(row.unlinkedTask as TaskColumns)
					: null,
				prUrl: row.entry.prUrl,
				page: row.page?.id ? row.page : null,
				suggestedBy: row.suggestedBy?.userId ? row.suggestedBy : null,
				suggestionSource: row.suggestion?.source ?? null,
			}));
			if (entries.some((entry) => entry.event === "created")) return entries;
			// Boxes made before the log existed still show where they started.
			const creator = row.createdByUserId
				? await db.query.users.findFirst({
						where: eq(users.id, row.createdByUserId),
						columns: { id: true, name: true, image: true },
					})
				: undefined;
			return [
				{
					id: `created:${row.id}`,
					at: row.createdAt,
					actor: creator
						? {
								kind: "user" as const,
								person: {
									userId: creator.id,
									name: creator.name,
									image: creator.image,
								},
							}
						: { kind: "system" as const },
					event: "created" as const,
					fromName: null,
					toName: null,
					fromVisibility: null,
					toVisibility: null,
					fromProject: null,
					toProject: null,
					addedLabels: [],
					removedLabels: [],
					linkedTask: null,
					unlinkedTask: null,
					prUrl: null,
					page: null,
					suggestedBy: null,
					suggestionSource: null,
				},
				...entries,
			];
		}),

	tasks: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			const visible = await db
				.select({ id: cloudWorkspaces.id })
				.from(cloudWorkspaces)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						visibleTo(ctx.userId),
					),
				);
			return loadLinkedTasks(visible.map((row) => row.id));
		}),

	/** Which labels each visible workspace in the organization carries. */
	labels: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertCloudAccess(ctx);
			assertMember(ctx.organizationIds, input.organizationId);
			return db
				.select({
					cloudWorkspaceId: cloudWorkspaceLabels.cloudWorkspaceId,
					labelId: cloudWorkspaceLabels.labelId,
				})
				.from(cloudWorkspaceLabels)
				.innerJoin(
					cloudWorkspaces,
					eq(cloudWorkspaceLabels.cloudWorkspaceId, cloudWorkspaces.id),
				)
				.where(
					and(
						eq(cloudWorkspaces.organizationId, input.organizationId),
						visibleTo(ctx.userId),
					),
				);
		}),

	linkTask: jwtProcedure
		.input(z.object({ id: z.string().uuid(), taskId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			await assertTaskInOrganization(input.taskId, row.organizationId);
			await linkTask({
				cloudWorkspaceId: row.id,
				taskId: input.taskId,
				actor: { kind: "user", userId: ctx.userId },
			});
			nudge(row.organizationId, "cloud_workspaces");
			return { linked: true };
		}),

	unlinkTask: jwtProcedure
		.input(z.object({ id: z.string().uuid(), taskId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [removed] = await db
				.delete(cloudWorkspaceTasks)
				.where(
					and(
						eq(cloudWorkspaceTasks.cloudWorkspaceId, row.id),
						eq(cloudWorkspaceTasks.taskId, input.taskId),
					),
				)
				.returning({ taskId: cloudWorkspaceTasks.taskId });
			if (removed) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ unlinkedTaskId: input.taskId },
				);
				nudge(row.organizationId, "cloud_workspaces");
			}
			return { unlinked: Boolean(removed) };
		}),

	/** Hands uploads to the box; it can fetch only the files attached to it. */
	attachFiles: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				fileIds: z.array(z.string().uuid()).min(1).max(10),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			await anchorAttachments({
				parentKind: "cloud_workspace",
				parentId: row.id,
				organizationId: row.organizationId,
				fileIds: input.fileIds,
			});
			return { attached: true };
		}),

	/** Anyone who can see the box may edit it, and so may the box's own agent, for itself only. */
	setDescription: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				description: z.string().trim().max(DESCRIPTION_MAX_LENGTH),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (ctx.sandboxCaller && ctx.sandboxCaller.workspaceId !== input.id) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "A cloud workspace can only describe itself",
				});
			}
			const row = await loadVisibleWorkspace(ctx, input.id);
			const description = input.description || null;
			if (description === row.description) return { description };
			await db
				.update(cloudWorkspaces)
				.set({ description })
				.where(eq(cloudWorkspaces.id, row.id));
			await recordCloudWorkspaceActivity(
				db,
				row.id,
				ctx.sandboxCaller
					? { kind: "system" }
					: { kind: "user", userId: ctx.userId },
				{ event: "description_edited" },
			);
			nudge(row.organizationId, "cloud_workspaces");
			return { description };
		}),

	setProject: jwtProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				projectId: z.string().uuid().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			await setProject({ row, projectId: input.projectId, userId: ctx.userId });
			nudge(row.organizationId, "cloud_workspaces");
			return { projectId: input.projectId };
		}),

	/** Adds a label by name, creating it in the organization when it is new. */
	addLabel: jwtProcedure
		.input(z.object({ id: z.string().uuid(), name: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [label] = await ensureLabels(db, row.organizationId, [input.name]);
			if (!label) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid label" });
			}
			await addLabel({ row, labelId: label.id, userId: ctx.userId });
			nudge(row.organizationId, "cloud_workspaces");
			return { labelId: label.id };
		}),

	removeLabel: jwtProcedure
		.input(z.object({ id: z.string().uuid(), labelId: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.id);
			const [removed] = await db
				.delete(cloudWorkspaceLabels)
				.where(
					and(
						eq(cloudWorkspaceLabels.cloudWorkspaceId, row.id),
						eq(cloudWorkspaceLabels.labelId, input.labelId),
					),
				)
				.returning({ labelId: cloudWorkspaceLabels.labelId });
			if (removed) {
				await recordCloudWorkspaceActivity(
					db,
					row.id,
					{ kind: "user", userId: ctx.userId },
					{ removedLabelIds: [input.labelId] },
				);
				nudge(row.organizationId, "cloud_workspaces");
			}
			return { removed: Boolean(removed) };
		}),
} satisfies TRPCRouterRecord;
