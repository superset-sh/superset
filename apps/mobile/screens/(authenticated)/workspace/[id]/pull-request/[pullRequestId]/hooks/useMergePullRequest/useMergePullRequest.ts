import { useMutation } from "@tanstack/react-query";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import type {
	MergeMethod,
	PullRequestDetail,
} from "../../../../utils/pullRequest";

const METHOD_LABEL: Record<MergeMethod, string> = {
	squash: "Squash & Merge",
	merge: "Merge Commit",
	rebase: "Rebase & Merge",
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
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	onMerged: () => void;
}) {
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: (mergeMethod: MergeMethod) => {
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
		onSuccess: onMerged,
		onError: (error: Error) => {
			Alert.alert("GitHub refused the merge", error.message);
		},
	});

	function confirmAndMerge(detail: PullRequestDetail) {
		const method = detail.mergeability.allowedMergeMethods[0];
		if (!method) {
			Alert.alert(
				"No merge method allowed",
				"This repository does not allow merging from here.",
			);
			return;
		}
		Alert.alert(
			METHOD_LABEL[method],
			`#${detail.pullRequest.number} ${detail.pullRequest.title}\n\nThis merges into ${detail.pullRequest.baseBranch} and cannot be undone here.`,
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: METHOD_LABEL[method],
					style: "destructive",
					onPress: () => mutation.mutate(method),
				},
			],
		);
	}

	return { confirmAndMerge, isMerging: mutation.isPending };
}
