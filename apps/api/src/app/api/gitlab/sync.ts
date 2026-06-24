import { randomBytes } from "node:crypto";
import { db } from "@superset/db/client";
import {
	type GitLabConfig,
	integrationConnections,
	type NormalizedReviewState,
	pullRequests,
	repositories,
	type SelectIntegrationConnection,
} from "@superset/db/schema";
import { and, eq, max } from "drizzle-orm";

import { env } from "@/env";
import {
	GitLabClient,
	type GitLabMergeRequest,
	type GitLabProject,
} from "./client";
import { buildReviewState, mapPipelineStatus, mapState } from "./mappers";

async function upsertProject(
	project: GitLabProject,
	connection: SelectIntegrationConnection,
	host: string,
): Promise<string> {
	const [row] = await db
		.insert(repositories)
		.values({
			provider: "gitlab",
			host,
			connectionId: connection.id,
			organizationId: connection.organizationId,
			externalId: String(project.id),
			owner: project.namespace.full_path,
			name: project.path,
			fullName: project.path_with_namespace,
			defaultBranch: project.default_branch ?? "main",
			isPrivate: project.visibility !== "public",
		})
		.onConflictDoUpdate({
			target: [
				repositories.provider,
				repositories.host,
				repositories.externalId,
			],
			set: {
				connectionId: connection.id,
				organizationId: connection.organizationId,
				owner: project.namespace.full_path,
				name: project.path,
				fullName: project.path_with_namespace,
				defaultBranch: project.default_branch ?? "main",
				isPrivate: project.visibility !== "public",
				updatedAt: new Date(),
			},
		})
		.returning({ id: repositories.id });
	if (!row) throw new Error(`Failed to upsert repository ${project.id}`);
	return row.id;
}

async function upsertMergeRequest(
	mr: GitLabMergeRequest,
	reviewStateJson: NormalizedReviewState,
	repositoryId: string,
	connection: SelectIntegrationConnection,
	host: string,
): Promise<void> {
	const checksStatus = mapPipelineStatus(mr.head_pipeline?.status);
	const checks = mr.head_pipeline
		? [
				{
					name: "pipeline",
					status: mr.head_pipeline.status,
					conclusion: mr.head_pipeline.status,
					detailsUrl: mr.head_pipeline.web_url,
				},
			]
		: [];
	const state = mapState(mr.state, mr.draft);

	await db
		.insert(pullRequests)
		.values({
			repositoryId,
			organizationId: connection.organizationId,
			provider: "gitlab",
			host,
			number: mr.iid,
			externalId: String(mr.id),
			headBranch: mr.source_branch,
			headSha: mr.sha ?? "",
			baseBranch: mr.target_branch,
			title: mr.title,
			url: mr.web_url,
			authorLogin: mr.author?.username ?? "unknown",
			authorAvatarUrl: mr.author?.avatar_url ?? null,
			state,
			isDraft: mr.draft ?? false,
			reviewStateJson,
			checksStatus,
			checks,
			mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
			closedAt: mr.closed_at ? new Date(mr.closed_at) : null,
			lastSyncedAt: new Date(),
			updatedAt: new Date(mr.updated_at),
		})
		.onConflictDoUpdate({
			target: [pullRequests.repositoryId, pullRequests.number],
			set: {
				externalId: String(mr.id),
				headBranch: mr.source_branch,
				headSha: mr.sha ?? "",
				baseBranch: mr.target_branch,
				title: mr.title,
				url: mr.web_url,
				authorLogin: mr.author?.username ?? "unknown",
				authorAvatarUrl: mr.author?.avatar_url ?? null,
				state,
				isDraft: mr.draft ?? false,
				reviewStateJson,
				checksStatus,
				checks,
				mergedAt: mr.merged_at ? new Date(mr.merged_at) : null,
				closedAt: mr.closed_at ? new Date(mr.closed_at) : null,
				lastSyncedAt: new Date(),
				updatedAt: new Date(mr.updated_at),
			},
		});
}

/**
 * Fetches one MR (full §6 facts + approvals) and upserts it. Shared by the poll
 * loop and the webhook handler so both produce identical, faithful rows. Returns
 * false if the MR's project hasn't been synced into `repositories` yet.
 */
export async function syncOneMergeRequest(
	client: GitLabClient,
	connection: SelectIntegrationConnection,
	host: string,
	projectId: number,
	iid: number,
): Promise<boolean> {
	const [repo] = await db
		.select({ id: repositories.id })
		.from(repositories)
		.where(
			and(
				eq(repositories.provider, "gitlab"),
				eq(repositories.host, host),
				eq(repositories.externalId, String(projectId)),
			),
		)
		.limit(1);
	if (!repo) return false;

	const [mr, approvals] = await Promise.all([
		client.getMergeRequest(projectId, iid),
		client.getMergeRequestApprovals(projectId, iid).catch(() => null),
	]);
	await upsertMergeRequest(
		mr,
		buildReviewState(mr, approvals),
		repo.id,
		connection,
		host,
	);
	return true;
}

/** Returns the connection's webhook secret, generating + persisting one if absent. */
export async function getOrCreateWebhookSecret(
	connection: SelectIntegrationConnection,
): Promise<string> {
	const config = connection.config as GitLabConfig | null;
	if (config?.webhookSecret) return config.webhookSecret;
	const secret = randomBytes(24).toString("hex");
	const next: GitLabConfig = {
		provider: "gitlab",
		host: config?.host ?? "gitlab.com",
		authMode: config?.authMode ?? "token",
		groupPath: config?.groupPath,
		webhookSecret: secret,
	};
	await db
		.update(integrationConnections)
		.set({ config: next })
		.where(eq(integrationConnections.id, connection.id));
	return secret;
}

/**
 * Best-effort per-project webhook registration (parity with GitHub's webhook-driven
 * updates). Free on all GitLab tiers. Skips projects already hooked; tolerates
 * permission errors (token may lack Maintainer) — polling remains the safety net.
 */
async function reconcileProjectHooks(
	client: GitLabClient,
	connection: SelectIntegrationConnection,
	projects: GitLabProject[],
	secret: string,
): Promise<void> {
	const webhookUrl = `${env.NEXT_PUBLIC_API_URL}/api/gitlab/webhook?connection=${connection.id}`;
	for (const project of projects) {
		try {
			const hooks = await client.listProjectHooks(project.id);
			if (hooks.some((h) => h.url === webhookUrl)) continue;
			await client.createProjectHook(project.id, {
				url: webhookUrl,
				token: secret,
			});
		} catch {
			// Best-effort: token may lack Maintainer rights on this project.
		}
	}
}

/**
 * Syncs one GitLab connection: group projects → repositories, group MRs →
 * pull_requests with the §6 review/merge facts stored verbatim. Idempotent.
 * Also (best-effort) registers per-project webhooks for low-latency updates.
 *
 * `incremental` uses the latest synced MR timestamp as `updated_after` so periodic
 * polls only refetch what changed; the initial sync passes `false` for a full pull.
 */
export async function syncGitLabConnection(
	connection: SelectIntegrationConnection,
	{ incremental }: { incremental: boolean },
): Promise<{ projects: number; mergeRequests: number }> {
	const config = connection.config as GitLabConfig | null;
	const host = config?.host ?? "gitlab.com";
	const groupId = connection.externalOrgId;
	if (!groupId) throw new Error("Connection has no group id");

	const client = await GitLabClient.create(host, connection.accessToken);

	// Projects → repositories.
	const projects = await client.listGroupProjects(groupId);
	for (const project of projects) {
		await upsertProject(project, connection, host);
	}

	let updatedAfter: Date | undefined;
	if (incremental) {
		const [watermark] = await db
			.select({ value: max(pullRequests.updatedAt) })
			.from(pullRequests)
			.where(
				and(
					eq(pullRequests.organizationId, connection.organizationId),
					eq(pullRequests.provider, "gitlab"),
					eq(pullRequests.host, host),
				),
			);
		updatedAfter = watermark?.value ?? undefined;
	}

	const mrs = await client.listGroupMergeRequests(groupId, updatedAfter);
	let synced = 0;
	for (const listItem of mrs) {
		if (
			await syncOneMergeRequest(
				client,
				connection,
				host,
				listItem.project_id,
				listItem.iid,
			)
		) {
			synced += 1;
		}
	}

	// Low-latency updates (parity with GitHub webhooks); polling stays the baseline.
	try {
		const secret = await getOrCreateWebhookSecret(connection);
		await reconcileProjectHooks(client, connection, projects, secret);
	} catch (error) {
		console.error("[gitlab/sync] Webhook reconciliation failed:", error);
	}

	return { projects: projects.length, mergeRequests: synced };
}
