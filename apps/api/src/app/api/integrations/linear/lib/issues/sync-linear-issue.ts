import type { LinearClient } from "@linear/sdk";
import { db } from "@superset/db/client";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import { mapPriorityFromLinear } from "@superset/trpc/integrations/linear";
import { and, eq } from "drizzle-orm";
import { replaceAssetUrls } from "../assets/extract-asset-urls";
import { syncTaskAssets } from "../assets/sync-task-assets";
import { syncTaskComments } from "../comments/sync-task-comments";
import {
	fetchIssueDetails,
	type LinearIssueDetails,
} from "./fetch-issue-details";

interface SyncLinearIssueByIdOptions {
	client: LinearClient;
	organizationId: string;
	creatorUserId: string;
	issueId: string;
	linearAccessToken?: string;
}

interface SyncLinearIssueByPayloadOptions {
	organizationId: string;
	creatorUserId: string;
	issue: LinearIssueDetails;
	linearAccessToken?: string;
}

export async function syncLinearIssueById(
	options: SyncLinearIssueByIdOptions,
): Promise<"processed" | "skipped"> {
	let issue: LinearIssueDetails | null = null;
	try {
		issue = await fetchIssueDetails(options.client, options.issueId);
	} catch (error) {
		console.warn(
			`[linear/issues] Failed to fetch issue details for ${options.issueId}:`,
			error,
		);
		return "skipped";
	}
	if (!issue) {
		return "skipped";
	}

	return syncLinearIssueByPayload({
		organizationId: options.organizationId,
		creatorUserId: options.creatorUserId,
		issue,
		linearAccessToken: options.linearAccessToken,
	});
}

export async function syncLinearIssueByPayload(
	options: SyncLinearIssueByPayloadOptions,
): Promise<"processed" | "skipped"> {
	const { issue } = options;
	const taskStatus = await db.query.taskStatuses.findFirst({
		where: and(
			eq(taskStatuses.organizationId, options.organizationId),
			eq(taskStatuses.externalProvider, "linear"),
			eq(taskStatuses.externalId, issue.state.id),
		),
	});

	if (!taskStatus) {
		return "skipped";
	}

	let assigneeId: string | null = null;
	if (issue.assignee?.email) {
		const matchedUser = await db.query.users.findFirst({
			where: eq(users.email, issue.assignee.email),
		});
		assigneeId = matchedUser?.id ?? null;
	}

	const baseTaskData = {
		slug: issue.identifier,
		title: issue.title,
		description: issue.description ?? null,
		statusId: taskStatus.id,
		priority: mapPriorityFromLinear(issue.priority),
		assigneeId,
		estimate: issue.estimate ?? null,
		dueDate: issue.dueDate ? new Date(issue.dueDate) : null,
		labels: issue.labels.nodes.map((label) => label.name),
		startedAt: issue.startedAt ? new Date(issue.startedAt) : null,
		completedAt: issue.completedAt ? new Date(issue.completedAt) : null,
		externalProvider: "linear" as const,
		externalId: issue.id,
		externalKey: issue.identifier,
		externalUrl: issue.url,
		lastSyncedAt: new Date(),
	};

	const [task] = await db
		.insert(tasks)
		.values({
			...baseTaskData,
			organizationId: options.organizationId,
			creatorId: options.creatorUserId,
			createdAt: new Date(issue.createdAt),
		})
		.onConflictDoUpdate({
			target: [tasks.organizationId, tasks.externalProvider, tasks.externalId],
			set: {
				...baseTaskData,
				deletedAt: null,
				syncError: null,
			},
		})
		.returning({
			id: tasks.id,
			description: tasks.description,
		});

	if (!task) {
		return "skipped";
	}

	const assetUrlMap = await syncTaskAssets({
		organizationId: options.organizationId,
		taskId: task.id,
		linearAccessToken: options.linearAccessToken,
		sources: [
			{
				sourceKind: "description",
				markdown: issue.description,
			},
			...issue.comments.nodes.map((comment) => ({
				sourceKind: "comment",
				markdown: comment.body,
			})),
			...issue.attachments.nodes
				.map((attachment) => attachment.url)
				.filter((url): url is string => !!url)
				.map((url) => ({
					sourceKind: "attachment",
					url,
				})),
		],
	});

	const rewrittenDescription = replaceAssetUrls(issue.description, assetUrlMap);
	if ((task.description ?? "") !== rewrittenDescription) {
		await db
			.update(tasks)
			.set({
				description: rewrittenDescription,
				lastSyncedAt: new Date(),
			})
			.where(eq(tasks.id, task.id));
	}

	await syncTaskComments({
		organizationId: options.organizationId,
		taskId: task.id,
		comments: issue.comments.nodes,
		urlMap: assetUrlMap,
	});

	return "processed";
}
