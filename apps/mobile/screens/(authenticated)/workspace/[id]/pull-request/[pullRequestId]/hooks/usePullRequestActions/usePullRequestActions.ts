import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { errorCopy } from "@/lib/errors";
import {
	getHostServiceClientByUrl,
	hostServiceUrl,
} from "@/lib/host-service/client";
import type { PlainActionId } from "../../utils/pullRequestState";

import {
	type GitlabActionContext,
	type GitlabActionTarget,
	gitlabActionTarget,
	gitlabTargetError,
	gitlabUnavailableError,
	sameGitlabActionTarget,
} from "../gitlabActionTarget";

interface NativeAction {
	action: PlainActionId;
	target: GitlabActionTarget;
}
const NATIVE_CAPABILITY = {
	"mark-ready": "markReady",
	"update-branch": "updateBranch",
	reopen: "reopen",
} as const;

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
	gitlab,
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	onDone: () => void;
	gitlab?: GitlabActionContext;
}) {
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

	const queryClient = useQueryClient();
	const mutation = useMutation({
		networkMode: "always" as const,
		mutationFn: async (action: PlainActionId | NativeAction) => {
			if (typeof action !== "string") {
				if (!sameGitlabActionTarget(action.target, latestTarget.current))
					throw gitlabTargetError();
				if (
					action.action === "dequeue" ||
					!latestTarget.current?.detail.capabilities[
						NATIVE_CAPABILITY[action.action]
					]
				)
					throw gitlabUnavailableError();
				const github = getHostServiceClientByUrl(action.target.hostUrl).github;
				switch (action.action) {
					case "mark-ready":
						await github.markPullRequestReady.mutate(action.target.request);
						break;
					case "update-branch":
						await github.updatePullRequestBranch.mutate(action.target.request);
						break;
					case "reopen":
						await github.reopenPullRequest.mutate(action.target.request);
						break;
				}
				return;
			}
			if (gitlab) throw gitlabTargetError();
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
		onSuccess: (_result, action) => {
			if (typeof action !== "string") {
				const request = action.target.request;
				void queryClient.invalidateQueries({
					queryKey: [
						"workspace-pull-request",
						request.workspaceId,
						request.pullNumber,
						"gitlab",
						request.projectId,
						action.target.hostUrl,
						request.host,
						request.owner,
						request.repo,
						request.expectedUrl,
					],
				});
				void queryClient.invalidateQueries({
					queryKey: ["workspace-pull-request-history", request.workspaceId],
				});
			}
			if (
				typeof action === "string" ||
				sameGitlabActionTarget(action.target, latestTarget.current)
			)
				onDone();
		},
		onError: (error: Error, action) => {
			if (
				typeof action !== "string" &&
				(!nativeOwnerLive.current ||
					!sameGitlabActionTarget(action.target, latestTarget.current))
			)
				return;
			Alert.alert(
				i18n._(
					REFUSED_TITLE[typeof action === "string" ? action : action.action],
				),
				errorCopy(error),
			);
		},
	});

	// mutation.isPending is a render snapshot — two taps inside one frame both
	// read false. The ref latches synchronously.
	const inFlight = useRef(false);

	return {
		run: (action: PlainActionId) => {
			if (inFlight.current) return;
			if (gitlab) {
				if (!nativeOwnerLive.current) return;
				if (!target || !sameGitlabActionTarget(target, latestTarget.current)) {
					Alert.alert(
						i18n._(REFUSED_TITLE[action]),
						errorCopy(gitlabTargetError()),
					);
					return;
				}
				inFlight.current = true;
				mutation.mutate(
					{ action, target },
					{
						onSettled: () => {
							inFlight.current = false;
						},
					},
				);
				return;
			}
			inFlight.current = true;
			mutation.mutate(action, {
				onSettled: () => {
					inFlight.current = false;
				},
			});
		},
		busyAction: mutation.isPending
			? typeof mutation.variables === "string"
				? mutation.variables
				: (mutation.variables?.action ?? null)
			: null,
	};
}
