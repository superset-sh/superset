import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import type { LinkedPR } from "renderer/stores/new-workspace-draft";
export function pullRequestPromptKey(
	link: LinkedPR,
	target?: { projectId: string; hostUrl: string },
) {
	const ref = pullRequestRefFromUrl(link.url);
	if (ref?.provider !== "gitlab")
		return link.url.includes("/-/merge_requests/")
			? null
			: `pr:${link.prNumber}`;
	if (!target || ref.number !== link.prNumber) return null;
	return `gitlab-mr:${JSON.stringify([target.hostUrl, target.projectId, ref.host, ref.repoFullName, ref.number])}`;
}
