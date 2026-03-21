import { db } from "@superset/db/client";
import { accounts, members, taskStatuses, tasks } from "@superset/db/schema";
import { and, asc, eq, inArray } from "drizzle-orm";
import { pickPreferredStatusByType } from "./issue-statuses";

/**
 * Resolve org task statuses by generic type.
 * Prefer non-external statuses when they exist, otherwise fall back to the
 * first matching status by position regardless of provider.
 */
export async function resolveOrgTaskStatuses(organizationId: string) {
	const statuses = await db
		.select({
			id: taskStatuses.id,
			type: taskStatuses.type,
			externalProvider: taskStatuses.externalProvider,
		})
		.from(taskStatuses)
		.where(eq(taskStatuses.organizationId, organizationId))
		.orderBy(asc(taskStatuses.position));

	const unstartedStatus = pickPreferredStatusByType(statuses, "unstarted");
	const completedStatus = pickPreferredStatusByType(statuses, "completed");

	return { unstartedStatus, completedStatus };
}

/**
 * Try to match a GitHub user ID to a Superset user who is a member of the given org.
 * Returns the Superset userId if found, or null.
 */
export async function resolveGithubAssignee(
	githubUserId: number,
	organizationId: string,
): Promise<string | null> {
	const [match] = await db
		.select({ userId: accounts.userId })
		.from(accounts)
		.innerJoin(members, eq(members.userId, accounts.userId))
		.where(
			and(
				eq(accounts.providerId, "github"),
				eq(accounts.accountId, String(githubUserId)),
				eq(members.organizationId, organizationId),
			),
		)
		.limit(1);

	return match?.userId ?? null;
}

/**
 * Batch-resolve multiple GitHub user IDs to Superset user IDs.
 * Returns a Map<githubUserId (string), supersetUserId>.
 */
export async function batchResolveGithubAssignees(
	githubUserIds: number[],
	organizationId: string,
): Promise<Map<string, string>> {
	if (githubUserIds.length === 0) return new Map();

	const stringIds = githubUserIds.map(String);
	const matches = await db
		.select({ accountId: accounts.accountId, userId: accounts.userId })
		.from(accounts)
		.innerJoin(members, eq(members.userId, accounts.userId))
		.where(
			and(
				eq(accounts.providerId, "github"),
				inArray(accounts.accountId, stringIds),
				eq(members.organizationId, organizationId),
			),
		);

	const map = new Map<string, string>();
	for (const m of matches) {
		map.set(m.accountId, m.userId);
	}
	return map;
}

export interface GitHubIssue {
	id: number;
	number: number;
	html_url: string;
	title: string;
	body?: string | null;
	created_at?: string;
	state?: string;
	pull_request?: unknown;
	assignee?: {
		id: number;
		login?: string;
		avatar_url?: string;
	} | null;
	labels?: Array<{ name?: string } | string | null>;
	closed_at?: string | null;
}

interface IssueTaskMapping {
	organizationId: string;
	externalProvider: "github";
	externalId: string;
	externalKey: string;
	externalUrl: string;
	slug: string;
	title: string;
	description: string | null;
	labels: string[];
	statusId: string;
	assigneeId: string | null;
	assigneeExternalId: string | null;
	assigneeDisplayName: string | null;
	assigneeAvatarUrl: string | null;
	creatorId: string;
	createdAt: Date;
	lastSyncedAt: Date;
	completedAt: Date | null;
}

/**
 * Map a GitHub issue into fields suitable for upserting into the `tasks` table.
 */
export function mapGithubIssueToTask(
	issue: GitHubIssue,
	opts: {
		organizationId: string;
		repoFullName: string;
		statusId: string;
		creatorId: string;
		assigneeUserId: string | null;
		isCompleted: boolean;
	},
): IssueTaskMapping {
	const rawLabels = issue.labels ?? [];
	const labels: string[] = [];
	for (const l of rawLabels) {
		if (l == null) continue;
		const name = typeof l === "string" ? l : l.name;
		if (name) labels.push(name);
	}

	return {
		organizationId: opts.organizationId,
		externalProvider: "github",
		externalId: String(issue.id),
		externalKey: `#${issue.number}`,
		externalUrl: issue.html_url,
		slug: `gh:${opts.repoFullName}#${issue.number}`,
		title: issue.title,
		description: issue.body ?? null,
		labels,
		statusId: opts.statusId,
		assigneeId: opts.assigneeUserId,
		assigneeExternalId: issue.assignee?.id ? String(issue.assignee.id) : null,
		assigneeDisplayName: issue.assignee?.login ?? null,
		assigneeAvatarUrl: issue.assignee?.avatar_url ?? null,
		creatorId: opts.creatorId,
		createdAt: issue.created_at ? new Date(issue.created_at) : new Date(),
		lastSyncedAt: new Date(),
		completedAt:
			opts.isCompleted && issue.closed_at
				? new Date(issue.closed_at)
				: opts.isCompleted
					? new Date()
					: null,
	};
}

/**
 * Upsert a single GitHub issue as a Superset task.
 */
export async function upsertIssueTask(mapping: IssueTaskMapping) {
	await db
		.insert(tasks)
		.values(mapping)
		.onConflictDoUpdate({
			target: [tasks.organizationId, tasks.externalProvider, tasks.externalId],
			set: {
				externalKey: mapping.externalKey,
				externalUrl: mapping.externalUrl,
				slug: mapping.slug,
				title: mapping.title,
				description: mapping.description,
				labels: mapping.labels,
				statusId: mapping.statusId,
				assigneeId: mapping.assigneeId,
				assigneeExternalId: mapping.assigneeExternalId,
				assigneeDisplayName: mapping.assigneeDisplayName,
				assigneeAvatarUrl: mapping.assigneeAvatarUrl,
				lastSyncedAt: mapping.lastSyncedAt,
				completedAt: mapping.completedAt,
				deletedAt: null,
				updatedAt: new Date(),
			},
		});
}
