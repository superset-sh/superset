import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { useSession } from "@/lib/auth/client";
import { useGithubRefusalAlert } from "@/lib/github-connection";
import { apiClient } from "@/lib/trpc/client";
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
	owner,
	repo,
	pullNumber,
	onDone,
}: {
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	onDone: () => void;
}) {
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const alertRefusal = useGithubRefusalAlert();

	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: async (action: PlainActionId) => {
			if (!organizationId || !owner || !repo || pullNumber === null) {
				throw new Error("Pull request is not resolved");
			}
			const github = apiClient.integration.github;
			const input = {
				organizationId,
				repoFullName: `${owner}/${repo}`,
				number: pullNumber,
			};
			switch (action) {
				case "mark-ready":
					return github.setPullRequestDraft.mutate({ ...input, draft: false });
				case "update-branch":
					return github.updatePullRequestBranch.mutate(input);
				case "reopen":
					return github.setPullRequestState.mutate({ ...input, state: "open" });
				case "dequeue":
					return github.dequeuePullRequest.mutate(input);
			}
		},
		onSuccess: onDone,
		onError: (error: Error, action) => {
			alertRefusal(i18n._(REFUSED_TITLE[action]), error);
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
