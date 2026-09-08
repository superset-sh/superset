import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import type { PullRequestDetail } from "../../hooks/usePullRequestDetail";

export interface PullRequestDetailFallback {
	message: string;
	isLoading?: boolean;
	isError?: boolean;
	onRetry?: () => void;
}

export type ResolvedPullRequestDetail =
	| {
			status: "ready";
			data: PullRequestDetail;
			projectId: string;
			hostUrl: string;
	  }
	| ({ status: "fallback" } & PullRequestDetailFallback);

interface ResolvePullRequestDetailInput {
	prNumber: number | null;
	projectId: string | null;
	/** Whether the project list has finished loading from the user's hosts. */
	areProjectsReady: boolean;
	hasProject: boolean;
	hostUrl: string | null;
	isLoading: boolean;
	error: unknown;
	data: PullRequestDetail | null | undefined;
	refetch: () => void;
}

/**
 * Decide whether a PR detail can render, or which placeholder to show
 * instead — checked in the order the failures nest: a bad link, no project,
 * a project that isn't on any host, an unreachable host, still loading, a
 * failed fetch.
 */
export function resolvePullRequestDetail({
	prNumber,
	projectId,
	areProjectsReady,
	hasProject,
	hostUrl,
	isLoading,
	error,
	data,
	refetch,
}: ResolvePullRequestDetailInput): ResolvedPullRequestDetail {
	if (prNumber === null) {
		return {
			status: "fallback",
			message: i18n._(msg({ message: "This pull request link is invalid." })),
			isError: true,
		};
	}
	if (!projectId) {
		return {
			status: "fallback",
			message: i18n._(
				msg({
					message:
						"Choose a project from Pull requests before opening a pull request.",
				}),
			),
		};
	}
	if (!hasProject) {
		return areProjectsReady
			? {
					status: "fallback",
					message: i18n._(
						msg({
							message: "This project is no longer available on your devices.",
						}),
					),
					isError: true,
				}
			: {
					status: "fallback",
					message: i18n._(msg({ message: "Loading project…" })),
					isLoading: true,
				};
	}
	if (!hostUrl) {
		return {
			status: "fallback",
			message: i18n._(
				msg({ message: "The device that hosts this project is unavailable." }),
			),
			isError: true,
		};
	}
	if (isLoading) {
		return {
			status: "fallback",
			message: i18n._(msg({ message: "Loading pull request…" })),
			isLoading: true,
		};
	}
	if (error instanceof Error || !data) {
		return {
			status: "fallback",
			message: errorMessage(
				error,
				i18n._(msg({ message: "Pull request not found." })),
			),
			isError: true,
			onRetry: refetch,
		};
	}
	return { status: "ready", data, projectId, hostUrl };
}
