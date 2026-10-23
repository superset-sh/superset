import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useSession } from "@/lib/auth/client";
import { useGithubRefusalAlert } from "@/lib/github-connection";
import { apiClient } from "@/lib/trpc/client";
import type {
	MergeMethod,
	PullRequestDetail,
} from "../../../../utils/pullRequest";

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
	owner,
	repo,
	pullNumber,
	onMerged,
}: {
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	onMerged: () => void;
}) {
	const { i18n, t } = useLingui();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const alertRefusal = useGithubRefusalAlert();

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: (mergeMethod: MergeMethod) => {
			if (!organizationId || !owner || !repo || pullNumber === null) {
				throw new Error("Pull request is not resolved");
			}
			return apiClient.integration.github.mergePullRequest.mutate({
				organizationId,
				repoFullName: `${owner}/${repo}`,
				number: pullNumber,
				mergeMethod,
			});
		},
		onSuccess: onMerged,
		onError: (error: Error) => {
			alertRefusal(
				t({
					message: "GitHub refused the merge",
				}),
				error,
			);
		},
	});

	function confirmAndMerge(detail: PullRequestDetail) {
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
