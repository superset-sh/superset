import type { PullRequestDiff } from "@superset/shared/pull-request-diff";
import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { combinePullRequestReadErrors } from "../../../../utils/combinePullRequestReadErrors";

interface PullRequestDiffInput {
	projectId: string | null;
	hostUrl: string | null;
	repoFullName: string | null;
	prNumber: number;
	organizationId: string | null;
}

export async function fetchPullRequestDiff({
	projectId,
	hostUrl,
	repoFullName,
	prNumber,
	organizationId,
}: PullRequestDiffInput): Promise<PullRequestDiff> {
	let repositoryError: unknown;
	if (hostUrl) {
		if (projectId) {
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				return await client.pullRequests.getDiff.query({ projectId, prNumber });
			} catch (error) {
				if (!repoFullName) throw error;
			}
		}
		if (repoFullName) {
			try {
				const client = getHostServiceClientByUrl(hostUrl);
				return await client.pullRequests.getDiffByRepo.query({
					repoFullName,
					prNumber,
				});
			} catch (error) {
				if (!organizationId) throw error;
				repositoryError = error;
			}
		}
	}
	if (!organizationId || !repoFullName) {
		throw new Error("No GitHub repository available to fetch the diff");
	}
	try {
		return await cloudTrpcClient.integration.github.getPullRequestDiff.query({
			organizationId,
			repoFullName,
			number: prNumber,
		});
	} catch (error) {
		throw combinePullRequestReadErrors(repositoryError, error);
	}
}
