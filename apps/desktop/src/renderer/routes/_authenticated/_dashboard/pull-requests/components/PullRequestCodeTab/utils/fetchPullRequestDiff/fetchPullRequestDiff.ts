import type { PullRequestDiff } from "@superset/shared/pull-request-diff";
import { readPullRequestDiff } from "../../../../utils/pullRequestClient";

export function fetchPullRequestDiff({
	projectId,
	hostUrl,
	repoFullName,
	prNumber,
	organizationId,
}: {
	projectId: string | null;
	hostUrl: string | null;
	repoFullName: string | null;
	prNumber: number;
	organizationId: string | null;
}): Promise<PullRequestDiff> {
	return readPullRequestDiff({
		organizationId,
		repoFullName,
		prNumber,
		host: hostUrl ? { hostUrl, projectId } : null,
	});
}
