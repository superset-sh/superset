import { readPullRequestContent } from "../../../../utils/pullRequestClient";
import type { PullRequestDetail } from "../../usePullRequestDetail";

export function fetchPullRequestDetail({
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
}): Promise<PullRequestDetail> {
	return readPullRequestContent({
		organizationId,
		repoFullName,
		prNumber,
		host: hostUrl ? { hostUrl, projectId } : null,
	});
}
