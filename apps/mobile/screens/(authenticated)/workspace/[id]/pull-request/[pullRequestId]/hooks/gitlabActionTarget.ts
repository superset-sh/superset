import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import type { HostServiceClient } from "@/lib/host-service/client";
import { gitlabPullRequestFromUrl } from "@/lib/pull-request-links";
import type { useWorkspacePullRequestDetail } from "../../../hooks/useWorkspacePullRequestDetail";

import type { PullRequestDetail } from "../../../utils/pullRequest/types";

export type GitlabPullRequestDetail = NonNullable<
	ReturnType<typeof useWorkspacePullRequestDetail>["gitlabDetail"]
>;
type ExpectedPullRequest = NonNullable<
	Parameters<
		HostServiceClient["agents"]["run"]["mutate"]
	>[0]["expectedPullRequest"]
>;
export interface GitlabActionContext {
	projectId: ExpectedPullRequest["projectId"];
	host: ExpectedPullRequest["host"];
	expectedUrl: ExpectedPullRequest["expectedUrl"];
	detail: GitlabPullRequestDetail;
}
export function gitlabActionTarget(input: {
	gitlab?: GitlabActionContext;
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	workspace: { id: string; projectId: string | null } | null;
	hostUrl: string | null;
	organizationId: string | null;
}) {
	const {
		gitlab,
		workspaceId,
		owner,
		repo,
		pullNumber,
		workspace,
		hostUrl,
		organizationId,
	} = input;
	if (
		!gitlab ||
		!workspaceId ||
		!hostUrl ||
		!organizationId ||
		!gitlab.projectId ||
		!workspace ||
		workspace.id !== workspaceId ||
		workspace.projectId !== gitlab.projectId ||
		typeof gitlab.expectedUrl !== "string"
	)
		return null;
	const parsed = gitlabPullRequestFromUrl(gitlab.expectedUrl);
	if (
		!parsed ||
		parsed.expectedUrl !== gitlab.expectedUrl ||
		parsed.owner !== owner ||
		parsed.repo !== repo ||
		parsed.pullNumber !== pullNumber ||
		parsed.host !== gitlab.host ||
		gitlab.detail?.provider !== "gitlab" ||
		gitlab.detail.host !== parsed.host ||
		gitlab.detail.pullRequest?.url !== parsed.expectedUrl ||
		gitlab.detail.pullRequest.number !== parsed.pullNumber
	)
		return null;
	const expectedPullRequest: ExpectedPullRequest = {
		provider: "gitlab",
		projectId: gitlab.projectId,
		host: parsed.host,
		owner: parsed.owner,
		repo: parsed.repo,
		pullNumber: parsed.pullNumber,
		expectedUrl: parsed.expectedUrl,
	};
	return Object.freeze({
		key: JSON.stringify([
			organizationId,
			hostUrl,
			workspaceId,
			gitlab.projectId,
			parsed.host,
			parsed.owner,
			parsed.repo,
			parsed.pullNumber,
			parsed.expectedUrl,
		]),
		hostUrl,
		detail: gitlab.detail,
		expectedPullRequest: Object.freeze(expectedPullRequest),
		request: Object.freeze({ ...expectedPullRequest, workspaceId }),
	});
}
export type GitlabActionTarget = NonNullable<
	ReturnType<typeof gitlabActionTarget>
>;
export function sameGitlabActionTarget(
	captured: GitlabActionTarget | null,
	current: GitlabActionTarget | null,
) {
	return !!captured && !!current && captured.key === current.key;
}
export function gitlabTargetError() {
	return new Error(
		i18n._(
			msg({
				message: "GitLab merge request changed; refresh before trying again",
			}),
		),
	);
}
export function gitlabUnavailableError() {
	return new Error(
		i18n._(
			msg({
				message:
					"This operation is not available for this GitLab merge request",
			}),
		),
	);
}

export function isGitlabPullRequestDetail(
	detail: PullRequestDetail | GitlabPullRequestDetail,
): detail is GitlabPullRequestDetail {
	return "provider" in detail && detail.provider === "gitlab";
}
