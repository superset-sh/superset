import { db } from "@superset/db/client";
import type { IntegrationProvider } from "@superset/db/enums";
import {
	suggestions,
	taskLabels,
	taskProjects,
	taskStatuses,
	tasks,
} from "@superset/db/schema";
import { retiredTaskColumns } from "@superset/db/task-list-query";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { nudge } from "../../lib/realtime";
import { jwtProcedure } from "../../trpc";
import { loadVisibleWorkspace } from "../cloud-workspace/access";
import { addLabel, linkTask, setProject } from "../cloud-workspace/record";

const SOURCE_MAX_LENGTH = 64;

const cloudWorkspaceProposal = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("link_task"), taskId: z.string().uuid() }),
	z.object({ kind: z.literal("set_project"), projectId: z.string().uuid() }),
	z.object({ kind: z.literal("add_label"), labelId: z.string().uuid() }),
]);

type Proposal = z.infer<typeof cloudWorkspaceProposal>;

type Named = { id: string; name: string; color: string | null };
type NamedWithIcon = Named & { icon: string | null };

type CloudWorkspaceSuggestionView = {
	id: string;
	source: string;
	reason: string | null;
} & (
	| {
			kind: "link_task";
			task: {
				id: string;
				slug: string;
				externalProvider: IntegrationProvider | null;
				externalKey: string | null;
				title: string;
				status: {
					type: string;
					color: string;
					progressPercent: number | null;
				} | null;
			};
	  }
	| { kind: "set_project"; project: NamedWithIcon }
	| { kind: "add_label"; label: Named }
);

function toRow(proposal: Proposal) {
	switch (proposal.kind) {
		case "link_task":
			return {
				kind: "link_task" as const,
				objectType: "task" as const,
				objectId: proposal.taskId,
			};
		case "set_project":
			return {
				kind: "set_field" as const,
				objectType: "task_project" as const,
				objectId: proposal.projectId,
			};
		case "add_label":
			return {
				kind: "set_field" as const,
				objectType: "task_label" as const,
				objectId: proposal.labelId,
			};
	}
}

async function assertObjectInOrganization(
	proposal: Proposal,
	organizationId: string,
) {
	const found =
		proposal.kind === "link_task"
			? await db.query.tasks.findFirst({
					where: and(
						eq(tasks.id, proposal.taskId),
						eq(tasks.organizationId, organizationId),
						isNull(tasks.deletedAt),
					),
					columns: { id: true },
				})
			: proposal.kind === "set_project"
				? await db.query.taskProjects.findFirst({
						where: and(
							eq(taskProjects.id, proposal.projectId),
							eq(taskProjects.organizationId, organizationId),
						),
						columns: { id: true },
					})
				: await db.query.taskLabels.findFirst({
						where: and(
							eq(taskLabels.id, proposal.labelId),
							eq(taskLabels.organizationId, organizationId),
						),
						columns: { id: true },
					});
	if (!found) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "What the suggestion points at is not in this organization",
		});
	}
}

async function loadPending(id: string) {
	const suggestion = await db.query.suggestions.findFirst({
		where: eq(suggestions.id, id),
	});
	if (!suggestion || suggestion.subjectType !== "cloud_workspace") {
		throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
	}
	return suggestion;
}

/**
 * Proposed changes any member, API key or automation can make and a person
 * accepts or dismisses. A dismissed proposal is kept, so it is never made again.
 */
export const suggestionRouter = {
	listForCloudWorkspace: jwtProcedure
		.input(z.object({ cloudWorkspaceId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.cloudWorkspaceId);
			const pending = await db
				.select()
				.from(suggestions)
				.where(
					and(
						eq(suggestions.subjectType, "cloud_workspace"),
						eq(suggestions.subjectId, row.id),
						eq(suggestions.status, "pending"),
					),
				)
				.orderBy(asc(suggestions.createdAt));
			const idsOf = (type: string) =>
				pending.flatMap((s) =>
					s.objectType === type && s.objectId ? [s.objectId] : [],
				);
			const [taskRows, projectRows, labelRows] = await Promise.all([
				idsOf("task").length
					? db
							.select({
								id: tasks.id,
								slug: tasks.slug,
								externalProvider: retiredTaskColumns.externalProvider,
								externalKey: retiredTaskColumns.externalKey,
								title: tasks.title,
								statusType: taskStatuses.type,
								statusColor: taskStatuses.color,
								progressPercent: taskStatuses.progressPercent,
							})
							.from(tasks)
							.leftJoin(taskStatuses, eq(taskStatuses.id, tasks.statusId))
							.where(inArray(tasks.id, idsOf("task")))
					: [],
				idsOf("task_project").length
					? db
							.select({
								id: taskProjects.id,
								name: taskProjects.name,
								icon: taskProjects.icon,
								color: taskProjects.color,
							})
							.from(taskProjects)
							.where(inArray(taskProjects.id, idsOf("task_project")))
					: [],
				idsOf("task_label").length
					? db
							.select({
								id: taskLabels.id,
								name: taskLabels.name,
								color: taskLabels.color,
							})
							.from(taskLabels)
							.where(inArray(taskLabels.id, idsOf("task_label")))
					: [],
			]);
			return pending.flatMap((s): CloudWorkspaceSuggestionView[] => {
				const base = { id: s.id, source: s.source, reason: s.reason };
				if (s.objectType === "task") {
					const task = taskRows.find((t) => t.id === s.objectId);
					if (!task) return [];
					return [
						{
							...base,
							kind: "link_task" as const,
							task: {
								id: task.id,
								slug: task.slug,
								externalProvider: task.externalProvider,
								externalKey: task.externalKey,
								title: task.title,
								status:
									task.statusType && task.statusColor
										? {
												type: task.statusType,
												color: task.statusColor,
												progressPercent: task.progressPercent,
											}
										: null,
							},
						},
					];
				}
				if (s.objectType === "task_project") {
					const project = projectRows.find((p) => p.id === s.objectId);
					return project
						? [{ ...base, kind: "set_project" as const, project }]
						: [];
				}
				if (s.objectType === "task_label") {
					const label = labelRows.find((l) => l.id === s.objectId);
					return label
						? [{ ...base, kind: "add_label" as const, label: label }]
						: [];
				}
				return [];
			});
		}),

	/** Proposes a change to a cloud workspace; proposing one that was dismissed does nothing. */
	createForCloudWorkspace: jwtProcedure
		.input(
			z.object({
				cloudWorkspaceId: z.string().uuid(),
				proposal: cloudWorkspaceProposal,
				source: z.string().trim().min(1).max(SOURCE_MAX_LENGTH),
				reason: z.string().trim().max(500).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const row = await loadVisibleWorkspace(ctx, input.cloudWorkspaceId);
			await assertObjectInOrganization(input.proposal, row.organizationId);
			const [created] = await db
				.insert(suggestions)
				.values({
					organizationId: row.organizationId,
					subjectType: "cloud_workspace",
					subjectId: row.id,
					...toRow(input.proposal),
					source: input.source,
					reason: input.reason,
					proposedByKind: "user",
					proposedByUserId: ctx.userId,
				})
				.onConflictDoNothing()
				.returning({ id: suggestions.id });
			if (created) nudge(row.organizationId, "cloud_workspaces");
			return { id: created?.id ?? null };
		}),

	accept: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const suggestion = await loadPending(input.id);
			const row = await loadVisibleWorkspace(ctx, suggestion.subjectId);
			if (suggestion.status !== "pending" || !suggestion.objectId) {
				return { accepted: false };
			}
			const [claimed] = await db
				.update(suggestions)
				.set({
					status: "accepted",
					decidedByUserId: ctx.userId,
					decidedAt: new Date(),
				})
				.where(
					and(
						eq(suggestions.id, suggestion.id),
						eq(suggestions.status, "pending"),
					),
				)
				.returning({ id: suggestions.id });
			if (!claimed) return { accepted: false };
			const actor = { kind: "user" as const, userId: ctx.userId };
			switch (suggestion.objectType) {
				case "task":
					await linkTask({
						cloudWorkspaceId: row.id,
						taskId: suggestion.objectId,
						actor,
						suggestionId: suggestion.id,
					});
					break;
				case "task_project":
					await setProject({
						row,
						projectId: suggestion.objectId,
						userId: ctx.userId,
						suggestionId: suggestion.id,
					});
					break;
				case "task_label":
					await addLabel({
						row,
						labelId: suggestion.objectId,
						userId: ctx.userId,
						suggestionId: suggestion.id,
					});
					break;
			}
			nudge(row.organizationId, "cloud_workspaces");
			return { accepted: true };
		}),

	dismiss: jwtProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const suggestion = await loadPending(input.id);
			const row = await loadVisibleWorkspace(ctx, suggestion.subjectId);
			await db
				.update(suggestions)
				.set({
					status: "dismissed",
					decidedByUserId: ctx.userId,
					decidedAt: new Date(),
				})
				.where(
					and(
						eq(suggestions.id, suggestion.id),
						eq(suggestions.status, "pending"),
					),
				);
			nudge(row.organizationId, "cloud_workspaces");
			return { dismissed: true };
		}),
} satisfies TRPCRouterRecord;
