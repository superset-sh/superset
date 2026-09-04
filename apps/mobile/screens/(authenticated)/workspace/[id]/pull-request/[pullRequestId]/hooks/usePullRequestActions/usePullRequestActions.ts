import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import type { PlainActionId } from "../../utils/pullRequestState";

const REFUSED_TITLE: Record<PlainActionId, MessageDescriptor> = {
	"mark-ready": msg({
		message: "Could not mark ready",
	}),
	"update-branch": msg({
		message: "Could not update the branch",
	}),
	reopen: msg({
		message: "Could not reopen",
	}),
	dequeue: msg({
		message: "Could not leave the queue",
	}),
};

/**
 * The card's plain GitHub actions: mark ready, update branch, reopen,
 * dequeue. One at a time — the card shows the running one as busy — and a
 * refusal shows GitHub's own wording, which is the only text that says which
 * rule refused it.
 */
export function usePullRequestActions({
	workspaceId,
	owner,
	repo,
	pullNumber,
	onDone,
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	onDone: () => void;
}) {
	const { i18n } = useLingui();
	const { host } = useWorkspaceHost(workspaceId);
	const hostUrl =
		host?.isOnline === true
			? hostServiceUrl(host.organizationId, host.machineId)
			: null;

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: async (action: PlainActionId) => {
			if (!hostUrl || !owner || !repo || pullNumber === null) {
				throw new Error("Host is not resolved");
			}
			const github = getHostServiceClientByUrl(hostUrl).github;
			const input = { owner, repo, pullNumber };
			switch (action) {
				case "mark-ready":
					return github.markPullRequestReady.mutate(input);
				case "update-branch":
					return github.updatePullRequestBranch.mutate(input);
				case "reopen":
					return github.reopenPullRequest.mutate(input);
				case "dequeue":
					return github.dequeuePullRequest.mutate(input);
			}
		},
		onSuccess: onDone,
		onError: (error: Error, action) => {
			Alert.alert(i18n._(REFUSED_TITLE[action]), error.message);
		},
	});

	// mutation.isPending is a render snapshot — two taps inside one frame both
	// read false. The ref latches synchronously.
	const inFlight = useRef(false);

	return {
		run: (action: PlainActionId) => {
			if (inFlight.current) return;
			inFlight.current = true;
			mutation.mutate(action, {
				onSettled: () => {
					inFlight.current = false;
				},
			});
		},
		busyAction: mutation.isPending ? mutation.variables : null,
	};
}
