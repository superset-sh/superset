import { db } from "@superset/db/client";
import { taskStatuses, tasks, users } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";

interface GithubIssue {
	id: number;
	number: number;
	title: string;
	body?: string | null;
	html_url: string;
	state: string;
	assignee?: { login: string; email?: string | null } | null;
	labels: Array<{ name?: string } | string>;
}

interface ResolvedStatusIds {
	unstartedStatusId: string;
	completedStatusId: string;
}

export async function resolveTaskStatusIds({
	organizationId,
}: {
	organizationId: string;
}): Promise<ResolvedStatusIds | null> {
	const statuses = await db
		.select({ id: taskStatuses.id, type: taskStatuses.type })
		.from(taskStatuses)
		.where(eq(taskStatuses.organizationId, organizationId));

	const unstartedStatus = statuses.find((s) => s.type === "unstarted");
	const completedStatus = statuses.find((s) => s.type === "completed");

	if (!unstartedStatus || !completedStatus) {
		return null;
	}

	return {
		unstartedStatusId: unstartedStatus.id,
		completedStatusId: completedStatus.id,
	};
}

async function resolveAssigneeId({
	assignee,
}: {
	assignee?: GithubIssue["assignee"];
}): Promise<string | null> {
	if (!assignee?.email) {
		return null;
	}

	const matchedUser = await db.query.users.findFirst({
		where: eq(users.email, assignee.email),
		columns: { id: true },
	});

	return matchedUser?.id ?? null;
}

export function mapGithubIssueToTask({
	issue,
	repoName,
	statusId,
	assigneeId,
}: {
	issue: GithubIssue;
	repoName: string;
	statusId: string;
	assigneeId: string | null;
}) {
	return {
		slug: `${repoName}#${issue.number}`,
		title: issue.title,
		description: issue.body ?? null,
		statusId,
		assigneeId,
		labels: issue.labels
			.map((l) => (typeof l === "string" ? l : l.name))
			.filter((name): name is string => !!name),
		externalProvider: "github" as const,
		externalId: String(issue.id),
		externalKey: `#${issue.number}`,
		externalUrl: issue.html_url,
		lastSyncedAt: new Date(),
	};
}

export async function processGithubIssueEvent({
	issue,
	repoName,
	organizationId,
	creatorId,
	action,
}: {
	issue: GithubIssue;
	repoName: string;
	organizationId: string;
	creatorId: string;
	action:
		| "opened"
		| "edited"
		| "closed"
		| "reopened"
		| "assigned"
		| "unassigned"
		| "labeled"
		| "unlabeled"
		| "deleted";
}) {
	if (action === "deleted") {
		await db
			.update(tasks)
			.set({ deletedAt: new Date() })
			.where(
				and(
					eq(tasks.organizationId, organizationId),
					eq(tasks.externalProvider, "github"),
					eq(tasks.externalId, String(issue.id)),
				),
			);
		return;
	}

	const statusIds = await resolveTaskStatusIds({ organizationId });
	if (!statusIds) {
		console.warn(
			"[github/issues] Missing unstarted/completed status types for org:",
			organizationId,
		);
		return;
	}

	const statusId =
		issue.state === "closed"
			? statusIds.completedStatusId
			: statusIds.unstartedStatusId;

	const assigneeId = await resolveAssigneeId({ assignee: issue.assignee });

	const taskData = mapGithubIssueToTask({
		issue,
		repoName,
		statusId,
		assigneeId,
	});

	await db
		.insert(tasks)
		.values({
			...taskData,
			organizationId,
			creatorId,
			priority: "none",
		})
		.onConflictDoUpdate({
			target: [tasks.organizationId, tasks.externalProvider, tasks.externalId],
			set: { ...taskData, syncError: null },
		});
}
