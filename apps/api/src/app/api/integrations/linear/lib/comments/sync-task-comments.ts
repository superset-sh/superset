import { db } from "@superset/db/client";
import { taskComments } from "@superset/db/schema";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { replaceAssetUrls } from "../assets/extract-asset-urls";

interface LinearIssueComment {
	id: string;
	body: string | null;
	createdAt: string;
	updatedAt: string;
	url?: string | null;
	parent?: {
		id: string;
	} | null;
	user?: {
		id: string;
		name: string | null;
		avatarUrl: string | null;
	} | null;
}

interface SyncTaskCommentsOptions {
	organizationId: string;
	taskId: string;
	comments: LinearIssueComment[];
	urlMap: ReadonlyMap<string, string>;
}

export async function syncTaskComments(
	options: SyncTaskCommentsOptions,
): Promise<void> {
	const externalIds = options.comments.map((comment) => comment.id);

	if (externalIds.length > 0) {
		await db
			.update(taskComments)
			.set({
				deletedAt: new Date(),
				lastSyncedAt: new Date(),
			})
			.where(
				and(
					eq(taskComments.organizationId, options.organizationId),
					eq(taskComments.taskId, options.taskId),
					eq(taskComments.externalProvider, "linear"),
					notInArray(taskComments.externalId, externalIds),
					isNull(taskComments.deletedAt),
				),
			);
	} else {
		await db
			.update(taskComments)
			.set({
				deletedAt: new Date(),
				lastSyncedAt: new Date(),
			})
			.where(
				and(
					eq(taskComments.organizationId, options.organizationId),
					eq(taskComments.taskId, options.taskId),
					eq(taskComments.externalProvider, "linear"),
					isNull(taskComments.deletedAt),
				),
			);
	}

	for (const comment of options.comments) {
		const body = replaceAssetUrls(comment.body ?? "", options.urlMap);
		const createdAt = new Date(comment.createdAt);
		const updatedAt = new Date(comment.updatedAt);

		await db
			.insert(taskComments)
			.values({
				organizationId: options.organizationId,
				taskId: options.taskId,
				body,
				authorExternalId: comment.user?.id ?? null,
				authorName: comment.user?.name ?? null,
				authorAvatarUrl: comment.user?.avatarUrl ?? null,
				externalProvider: "linear",
				externalId: comment.id,
				externalUrl: comment.url ?? null,
				parentCommentExternalId: comment.parent?.id ?? null,
				lastSyncedAt: new Date(),
				deletedAt: null,
				createdAt,
				updatedAt,
			})
			.onConflictDoUpdate({
				target: [
					taskComments.organizationId,
					taskComments.externalProvider,
					taskComments.externalId,
				],
				set: {
					taskId: options.taskId,
					body,
					authorExternalId: comment.user?.id ?? null,
					authorName: comment.user?.name ?? null,
					authorAvatarUrl: comment.user?.avatarUrl ?? null,
					externalUrl: comment.url ?? null,
					parentCommentExternalId: comment.parent?.id ?? null,
					lastSyncedAt: new Date(),
					deletedAt: null,
					updatedAt,
				},
			});
	}
}
