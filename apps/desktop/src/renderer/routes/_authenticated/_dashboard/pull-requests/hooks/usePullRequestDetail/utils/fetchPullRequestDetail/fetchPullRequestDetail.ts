import { cloudTrpcClient } from "renderer/lib/cloud-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { combinePullRequestReadErrors } from "../../../../utils/combinePullRequestReadErrors";
import { fromHostPullRequestContent } from "../../../../utils/fromHostPullRequestContent";

export async function fetchPullRequestDetail({
	projectId,
	hostUrl,
	repoFullName,
	organizationId,
	prNumber,
}: {
	projectId: string | null;
	hostUrl: string | null;
	repoFullName: string | null;
	organizationId: string | null;
	prNumber: number;
}) {
	let repositoryError: unknown;
	if (hostUrl && projectId) {
		try {
			const content = await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.getContent.query({ projectId, prNumber });
			return fromHostPullRequestContent(content);
		} catch (error) {
			if (!repoFullName) throw error;
		}
	}
	if (hostUrl && repoFullName) {
		try {
			const content = await getHostServiceClientByUrl(
				hostUrl,
			).pullRequests.getContentByRepo.query({ repoFullName, prNumber });
			return fromHostPullRequestContent(content);
		} catch (error) {
			if (!organizationId) throw error;
			repositoryError = error;
		}
	}
	if (!organizationId || !repoFullName)
		throw new Error("No GitHub repository available to fetch the pull request");
	try {
		return await cloudTrpcClient.integration.github.getPullRequest.query({
			organizationId,
			repoFullName,
			number: prNumber,
		});
	} catch (error) {
		throw combinePullRequestReadErrors(repositoryError, error);
	}
}
