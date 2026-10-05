import {
	type ProjectTagAssignment,
	visibleWorkspaceTags,
	workspaceTagsInputSchema,
} from "@superset/shared/workspace-tags";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { HostDb } from "../db";
import { projects, projectTags } from "../db/schema";
import {
	type ProjectStoreContext,
	toProjectSnapshot,
} from "./local-project-store";

function toAssignment(row: {
	tag: string;
	createdByUserId: string;
}): ProjectTagAssignment {
	return {
		tag: row.tag,
		createdByUserId: row.createdByUserId || null,
	};
}

export function getProjectTagAssignments(
	db: HostDb,
	projectId: string,
): ProjectTagAssignment[] {
	return db
		.select()
		.from(projectTags)
		.where(eq(projectTags.projectId, projectId))
		.all()
		.map(toAssignment);
}

export function getProjectTagsByProjectId(
	db: HostDb,
	projectIds: string[],
	viewerUserId: string | null | undefined,
): Map<string, string[]> {
	const assignments = new Map<string, ProjectTagAssignment[]>();
	if (projectIds.length === 0) return new Map();
	for (const row of db
		.select()
		.from(projectTags)
		.where(inArray(projectTags.projectId, projectIds))
		.all()) {
		const tags = assignments.get(row.projectId) ?? [];
		tags.push(toAssignment(row));
		assignments.set(row.projectId, tags);
	}
	return new Map(
		[...assignments].map(([id, tags]) => [
			id,
			visibleWorkspaceTags(tags, viewerUserId),
		]),
	);
}

export function setProjectTags(
	ctx: ProjectStoreContext & { userId?: string },
	projectId: string,
	tags: string[],
) {
	const normalizedTags = workspaceTagsInputSchema.parse(tags);
	const row = ctx.db
		.select()
		.from(projects)
		.where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
		.get();
	if (!row) return undefined;
	const createdByUserId = ctx.userId ?? "";
	ctx.db.transaction((tx) => {
		tx.delete(projectTags)
			.where(
				and(
					eq(projectTags.projectId, projectId),
					ctx.userId == null
						? undefined
						: inArray(projectTags.createdByUserId, [createdByUserId, ""]),
				),
			)
			.run();
		if (normalizedTags.length > 0) {
			tx.insert(projectTags)
				.values(
					normalizedTags.map((tag) => ({ projectId, tag, createdByUserId })),
				)
				.run();
		}
	});
	const tagAssignments = getProjectTagAssignments(ctx.db, projectId);
	const project = toProjectSnapshot(row);
	ctx.eventBus.broadcastProjectChanged({
		projectId,
		eventType: "updated",
		project: { ...project, tagAssignments },
		occurredAt: Date.now(),
	});
	return {
		...project,
		tags: visibleWorkspaceTags(tagAssignments, ctx.userId),
	};
}

export function setProjectTagsBatch(
	ctx: ProjectStoreContext & { userId?: string },
	updates: Array<{ projectId: string; tags: string[] }>,
) {
	const messages: Parameters<
		ProjectStoreContext["eventBus"]["broadcastProjectChanged"]
	>[0][] = [];
	const eventBus = {
		...ctx.eventBus,
		broadcastProjectChanged: (message: (typeof messages)[number]) => {
			messages.push(message);
		},
	};
	const results = ctx.db.transaction(() =>
		updates.map((update) => {
			const result = setProjectTags(
				{ ...ctx, eventBus: eventBus as ProjectStoreContext["eventBus"] },
				update.projectId,
				update.tags,
			);
			if (!result)
				throw new Error(
					`Project is not set up on this host: ${update.projectId}`,
				);
			return result;
		}),
	);
	for (const message of messages) ctx.eventBus.broadcastProjectChanged(message);
	return results;
}
