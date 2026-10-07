import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { errorCopy } from "@/lib/errors";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import type {
	MergeMethod,
	PullRequestDetail,
} from "../../../../utils/pullRequest";

import {
	type GitlabActionContext,
	type GitlabActionTarget,
	type GitlabPullRequestDetail,
	gitlabActionTarget,
	gitlabTargetError,
	gitlabUnavailableError,
	isGitlabPullRequestDetail,
	sameGitlabActionTarget,
} from "../gitlabActionTarget";

interface NativeMerge {
	target: GitlabActionTarget;
	policyKey: string;
	mergeMethod: MergeMethod;
	squash: boolean;
}

const METHOD_LABEL: Record<MergeMethod, MessageDescriptor> = {
	squash: msg({
		message: "Squash & Merge",
	}),
	merge: msg({
		message: "Merge Commit",
	}),
	rebase: msg({
		message: "Rebase & Merge",
	}),
};

/**
 * Merging is irreversible from here, so it always asks first, and the question
 * names the pull request and the method rather than asking "are you sure".
 * GitHub's own refusal wording is shown verbatim: it is the only text that says
 * which rule stopped the merge.
 */
export function useMergePullRequest({
	workspaceId,
	owner,
	repo,
	pullNumber,
	onMerged,
	gitlab,
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	onMerged: () => void;
	gitlab?: GitlabActionContext;
}) {
	const { i18n, t } = useLingui();
	const { host, workspace } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	const target = gitlabActionTarget({
		gitlab,
		workspaceId,
		owner,
		repo,
		pullNumber,
		workspace,
		hostUrl,
		organizationId: host?.organizationId ?? null,
	});
	const latestTarget = useRef(target);
	latestTarget.current = target;
	const nativeOwnerLive = useRef(true);
	useEffect(() => {
		nativeOwnerLive.current = true;
		latestTarget.current = target;
		return () => {
			nativeOwnerLive.current = false;
			latestTarget.current = null;
		};
	}, [target]);
	const nativeInFlight = useRef(false);

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: (mergeMethod: MergeMethod | NativeMerge) => {
			if (typeof mergeMethod !== "string") {
				return (async () => {
					if (
						!sameGitlabActionTarget(mergeMethod.target, latestTarget.current) ||
						JSON.stringify(latestTarget.current?.detail.mergePolicy) !==
							mergeMethod.policyKey
					)
						throw gitlabTargetError();
					if (!latestTarget.current?.detail.capabilities.merge)
						throw gitlabUnavailableError();
					const result = await getHostServiceClientByUrl(
						mergeMethod.target.hostUrl,
					).github.mergePR.mutate({
						...mergeMethod.target.request,
						mergeMethod: mergeMethod.mergeMethod,
						squash: mergeMethod.squash,
					});
					if (!sameGitlabActionTarget(mergeMethod.target, latestTarget.current))
						throw gitlabTargetError();
					if (!result.merged)
						throw new Error(t({ message: "GitLab did not confirm the merge" }));
					return result;
				})();
			}
			if (gitlab) throw gitlabTargetError();
			if (!hostUrl || !owner || !repo || pullNumber === null) {
				throw new Error("Host is not resolved");
			}
			return getHostServiceClientByUrl(hostUrl).github.mergePR.mutate({
				owner,
				repo,
				pullNumber,
				mergeMethod,
			});
		},
		onSuccess: (_result, variables) => {
			if (
				typeof variables === "string" ||
				sameGitlabActionTarget(variables.target, latestTarget.current)
			)
				onMerged();
		},
		onError: (error: Error, variables) => {
			if (typeof variables !== "string" && !nativeOwnerLive.current) return;
			if (typeof variables !== "string") {
				Alert.alert(
					t({ message: "GitLab refused the merge" }),
					errorCopy(error),
				);
				return;
			}
			Alert.alert(
				t({
					message: "GitHub refused the merge",
				}),
				errorCopy(error),
			);
		},
	});

	function confirmAndMerge(
		detail: PullRequestDetail | GitlabPullRequestDetail,
	) {
		if (gitlab || isGitlabPullRequestDetail(detail)) {
			if (!nativeOwnerLive.current) return;
			if (
				!target ||
				!sameGitlabActionTarget(target, latestTarget.current) ||
				!isGitlabPullRequestDetail(detail) ||
				detail.host !== target.expectedPullRequest.host ||
				detail.pullRequest.url !== target.expectedPullRequest.expectedUrl ||
				detail.pullRequest.number !== target.expectedPullRequest.pullNumber
			) {
				Alert.alert(
					t({ message: "GitLab refused the merge" }),
					errorCopy(gitlabTargetError()),
				);
				return;
			}
			if (!detail.capabilities.merge) {
				Alert.alert(
					t({ message: "GitLab refused the merge" }),
					errorCopy(gitlabUnavailableError()),
				);
				return;
			}
			const policy = detail.mergePolicy;
			const mergeMethod: MergeMethod =
				policy.method === "merge" ? "merge" : "rebase";
			const methodLabel =
				policy.method === "ff"
					? t({ message: "Fast-forward merge" })
					: policy.method === "rebase_merge"
						? t({ message: "Rebase and merge" })
						: i18n._(METHOD_LABEL.merge);
			const squash =
				policy.squash === "always" ||
				(policy.squash !== "never" &&
					(policy.squashEnabled ?? policy.squash === "default_on"));
			const label = (value: boolean) =>
				value
					? t({ message: `${methodLabel} with squashed commits` })
					: methodLabel;
			const choice = (value: boolean) => ({
				text: label(value),
				style: "destructive" as const,
				onPress: () => {
					if (!nativeOwnerLive.current) return;
					if (nativeInFlight.current) return;
					if (
						!sameGitlabActionTarget(target, latestTarget.current) ||
						JSON.stringify(latestTarget.current?.detail.mergePolicy) !==
							JSON.stringify(policy)
					) {
						Alert.alert(
							t({ message: "GitLab refused the merge" }),
							errorCopy(gitlabTargetError()),
						);
						return;
					}
					nativeInFlight.current = true;
					mutation.mutate(
						{
							target,
							policyKey: JSON.stringify(policy),
							mergeMethod,
							squash: value,
						},
						{
							onSettled: () => {
								nativeInFlight.current = false;
							},
						},
					);
				},
			});
			Alert.alert(
				label(squash),
				t({
					message: `#${detail.pullRequest.number} ${detail.pullRequest.title}\n\nThis merges into ${detail.pullRequest.baseBranch} and cannot be undone here.`,
				}),
				[
					{ text: t({ message: "Cancel" }), style: "cancel" },
					choice(squash),
					...(policy.squash === "default_on" || policy.squash === "default_off"
						? [choice(!squash)]
						: []),
				],
			);
			return;
		}
		const method = detail.mergeability.allowedMergeMethods[0];
		if (!method) {
			Alert.alert(
				t({
					message: "No merge method allowed",
				}),
				t({
					message: "This repository does not allow merging from here.",
				}),
			);
			return;
		}
		Alert.alert(
			i18n._(METHOD_LABEL[method]),
			t({
				message: `#${detail.pullRequest.number} ${detail.pullRequest.title}\n\nThis merges into ${detail.pullRequest.baseBranch} and cannot be undone here.`,
			}),
			[
				{
					text: t({ message: "Cancel" }),
					style: "cancel",
				},
				{
					text: i18n._(METHOD_LABEL[method]),
					style: "destructive",
					onPress: () => mutation.mutate(method),
				},
			],
		);
	}

	return { confirmAndMerge, isMerging: mutation.isPending };
}
