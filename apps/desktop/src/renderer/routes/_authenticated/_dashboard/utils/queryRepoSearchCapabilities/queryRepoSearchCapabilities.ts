import { parseGitRemote } from "@superset/shared/git-remote";
import type { HostServiceClient } from "renderer/lib/host-service-client";
import { isMissingProcedureError } from "renderer/lib/isMissingProcedureError";

type IssueCapability = Awaited<
	ReturnType<
		HostServiceClient["workspaceCreation"]["getIssueSearchCapabilities"]["query"]
	>
>[number];
type PullRequestCapability = Awaited<
	ReturnType<
		HostServiceClient["workspaceCreation"]["getPullRequestSearchCapabilities"]["query"]
	>
>[number];
type GitHubIdentity = {
	projectId: string;
	provider: "github";
	host: "github.com";
	projectPath: string;
};

async function queryWithLegacyIdentity<T>(
	client: HostServiceClient,
	projectIds: string[],
	query: () => Promise<T[]>,
	capability: (identity: GitHubIdentity) => T,
): Promise<T[]> {
	try {
		return await query();
	} catch (error) {
		const code = (error as { data?: { code?: string } } | null)?.data?.code;
		if (!isMissingProcedureError(error) || (code && code !== "NOT_FOUND"))
			throw error;
		return Promise.all(
			[...new Set(projectIds)].map(async (projectId) => {
				const project = await client.project.get.query({ projectId });
				if (
					!project ||
					(project.repoProvider && project.repoProvider !== "github")
				)
					throw error;
				const remote = project.repoUrl ? parseGitRemote(project.repoUrl) : null;
				if (
					project.repoUrl &&
					(remote?.provider !== "github" || remote.host !== "github.com")
				)
					throw error;
				const owner = remote?.owner ?? project.repoOwner;
				const name = remote?.name ?? project.repoName;
				if (!owner || !name || owner.includes("/") || name.includes("/"))
					throw error;
				return capability({
					projectId,
					provider: "github",
					host: "github.com",
					projectPath: `${owner}/${name}`,
				});
			}),
		);
	}
}

export async function queryIssueSearchCapabilities(
	client: HostServiceClient,
	projectIds: string[],
): Promise<IssueCapability[]> {
	const ids = [...new Set(projectIds)];
	if (ids.length > 100) {
		const result = [];
		for (let offset = 0; offset < ids.length; offset += 100) {
			result.push(
				...(await queryIssueSearchCapabilities(
					client,
					ids.slice(offset, offset + 100),
				)),
			);
		}
		return result;
	}
	return queryWithLegacyIdentity(
		client,
		ids,
		() =>
			client.workspaceCreation.getIssueSearchCapabilities.query({
				projectIds: ids,
			}),
		(identity) => identity,
	);
}

export async function queryPullRequestSearchCapabilities(
	client: HostServiceClient,
	projectIds: string[],
): Promise<PullRequestCapability[]> {
	const ids = [...new Set(projectIds)];
	if (ids.length > 100) {
		const result = [];
		for (let offset = 0; offset < ids.length; offset += 100) {
			result.push(
				...(await queryPullRequestSearchCapabilities(
					client,
					ids.slice(offset, offset + 100),
				)),
			);
		}
		return result;
	}
	return queryWithLegacyIdentity(
		client,
		ids,
		() =>
			client.workspaceCreation.getPullRequestSearchCapabilities.query({
				projectIds: ids,
			}),
		(identity) => ({
			...identity,
			reviewSemantics: "history",
			teamReviewRequests: true,
			approvalRules: "available",
		}),
	);
}
