import type { LinkedPR } from "renderer/stores/new-workspace-draft";

export function requestContextKey(
	request: LinkedPR,
	context: { projectId?: string | null; hostId?: string | null } = {},
): string {
	return [
		"repository-request",
		request.provider ?? "github",
		context.hostId ?? "",
		context.projectId ?? "",
		request.instance ?? "",
		request.repoPath ?? "",
		request.url,
		request.prNumber,
	].join("\0");
}
