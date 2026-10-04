import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";

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
}: PullRequestDiffInput): Promise<{ patch: string }> {
	if (hostUrl) {
		try {
			const client = getHostServiceClientByUrl(hostUrl);
			if (projectId) {
				return await client.pullRequests.getDiff.query({ projectId, prNumber });
			}
			if (repoFullName) {
				return await client.pullRequests.getDiffByRepo.query({
					repoFullName,
					prNumber,
				});
			}
		} catch (error) {
			if (!organizationId || !repoFullName) throw error;
		}
	}
	if (!organizationId || !repoFullName) {
		throw new Error("No GitHub repository available to fetch the diff");
	}
	return cloudTrpcClient.integration.github.getPullRequestDiff.query({
		organizationId,
		repoFullName,
		number: prNumber,
	});
}
