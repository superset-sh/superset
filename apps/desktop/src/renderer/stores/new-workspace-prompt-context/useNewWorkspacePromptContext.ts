import { CLOUD_HOST_ID } from "@superset/shared/host-routing";
import { useEffect, useMemo, useRef } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { pullRequestRefFromUrl } from "renderer/lib/github/pullRequestRef";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	type GitLabIssuePromptTarget,
	gitLabIssuePromptKey,
} from "renderer/routes/_authenticated/utils/linkedIssueFromGitLab";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { buildSubmitPrompt } from "./buildSubmitPrompt";
import {
	fetchGitHubIssueBody,
	fetchGitLabIssueBody,
	fetchInternalTaskBody,
	fetchLinearIssueBody,
	fetchPrBody,
} from "./fetchers";
import { pullRequestPromptKey } from "./pullRequestPromptKey";
import { useNewWorkspacePromptContextStore } from "./store";

export interface NewWorkspacePromptContextApi {
	build: (args: {
		userPrompt: string;
		linkedPR: LinkedPR | null;
		linkedIssues: LinkedIssue[];
		timeoutMs: number;
	}) => Promise<string>;
}

export function useNewWorkspacePromptContext(args: {
	projectId: string | null;
	hostId: string | null;
	linkedPR: LinkedPR | null;
	linkedIssues: LinkedIssue[];
}): NewWorkspacePromptContextApi {
	const { projectId, hostId, linkedPR, linkedIssues } = args;
	const { machineId, activeHostUrl } = useLocalHostService();
	const activeOrganizationId = useActiveOrganizationId();
	const relayUrl = useRelayUrl();

	const hostUrl = useMemo(() => {
		const id = hostId ?? machineId;
		if (!id || !activeOrganizationId) return null;
		return resolveHostUrl({
			hostId: id,
			machineId,
			activeHostUrl,
			organizationId: activeOrganizationId,
			relayUrl,
		});
	}, [hostId, machineId, activeHostUrl, activeOrganizationId, relayUrl]);

	const gitlabTarget = useMemo<GitLabIssuePromptTarget | undefined>(() => {
		const selectedHostId = hostId ?? machineId;
		if (
			selectedHostId === CLOUD_HOST_ID ||
			!projectId ||
			!selectedHostId ||
			!hostUrl ||
			!activeOrganizationId
		)
			return undefined;
		return {
			projectId,
			hostId: selectedHostId,
			hostUrl,
			organizationId: activeOrganizationId,
		};
	}, [projectId, hostId, machineId, hostUrl, activeOrganizationId]);
	const gitlabSourceTargets = useMemo(() => {
		if (hostId !== CLOUD_HOST_ID || !activeOrganizationId) return undefined;
		return linkedIssues.flatMap((issue) => {
			const ref = issue.gitlab;
			if (!ref || issue.source !== "gitlab") return [];
			const sourceUrl = resolveHostUrl({
				hostId: ref.hostId,
				machineId,
				activeHostUrl,
				organizationId: activeOrganizationId,
				relayUrl,
			});
			return sourceUrl
				? [
						{
							organizationId: activeOrganizationId,
							projectId: ref.projectId,
							hostId: ref.hostId,
							hostUrl: sourceUrl,
						},
					]
				: [];
		});
	}, [
		hostId,
		activeOrganizationId,
		linkedIssues,
		machineId,
		activeHostUrl,
		relayUrl,
	]);
	const currentSources = useRef(gitlabSourceTargets);
	currentSources.current = gitlabSourceTargets;
	const pullRequestTarget = useMemo(
		() => (projectId && hostUrl ? { projectId, hostUrl } : undefined),
		[projectId, hostUrl],
	);
	const currentPullRequestTarget = useRef(pullRequestTarget);
	currentPullRequestTarget.current = pullRequestTarget;
	const currentGitlabTarget = useRef(gitlabTarget);
	currentGitlabTarget.current = gitlabTarget;

	useEffect(() => {
		const store = useNewWorkspacePromptContextStore.getState();

		if (linkedPR && projectId && hostUrl) {
			const prNumber = linkedPR.prNumber;
			const key = pullRequestPromptKey(linkedPR, { projectId, hostUrl });
			if (key)
				store.register(key, () =>
					fetchPrBody({
						prNumber,
						projectId,
						hostUrl,
						expectedUrl: linkedPR.url,
					}),
				);
		}

		for (const issue of linkedIssues) {
			if (issue.source === "gitlab") {
				const source =
					gitlabSourceTargets?.find(
						(value) =>
							value.projectId === issue.gitlab?.projectId &&
							value.hostId === issue.gitlab?.hostId,
					) ?? gitlabTarget;
				const key = gitLabIssuePromptKey(issue, source);
				const reference = issue.gitlab;
				if (key && reference && source)
					store.register(key, () =>
						fetchGitLabIssueBody({
							...reference,
							hostUrl: source.hostUrl,
						}),
					);
			} else if (
				issue.source === "github" &&
				issue.number != null &&
				projectId &&
				hostUrl
			) {
				const issueNumber = issue.number;
				store.register(`github-issue:${issueNumber}`, () =>
					fetchGitHubIssueBody({ issueNumber, projectId, hostUrl }),
				);
			} else if (issue.source === "internal" && issue.taskId) {
				const taskId = issue.taskId;
				store.register(`task:${taskId}`, () =>
					fetchInternalTaskBody({ taskId }),
				);
			} else if (issue.source === "linear" && activeOrganizationId) {
				const identifier = issue.slug;
				const organizationId = activeOrganizationId;
				store.register(`linear-issue:${identifier}`, () =>
					fetchLinearIssueBody({ organizationId, identifier }),
				);
			}
		}
	}, [
		projectId,
		hostUrl,
		linkedPR,
		linkedIssues,
		activeOrganizationId,
		gitlabTarget,
		gitlabSourceTargets,
	]);

	const legacyApi = useMemo<NewWorkspacePromptContextApi>(
		() => ({
			build: async (buildArgs) => {
				await useNewWorkspacePromptContextStore
					.getState()
					.awaitPending(buildArgs.timeoutMs);
				return buildSubmitPrompt({
					userPrompt: buildArgs.userPrompt,
					linkedPR: buildArgs.linkedPR,
					linkedIssues: buildArgs.linkedIssues,
				});
			},
		}),
		[],
	);
	const gitlabApi = useMemo<NewWorkspacePromptContextApi>(
		() => ({
			build: async (buildArgs) => {
				await useNewWorkspacePromptContextStore
					.getState()
					.awaitPending(buildArgs.timeoutMs);
				return buildSubmitPrompt({
					...buildArgs,
					pullRequestTarget:
						currentPullRequestTarget.current === pullRequestTarget
							? pullRequestTarget
							: undefined,
					gitlabSourceTargets:
						currentSources.current === gitlabSourceTargets
							? gitlabSourceTargets
							: undefined,
					gitlabTarget:
						currentGitlabTarget.current === gitlabTarget
							? gitlabTarget
							: undefined,
				});
			},
		}),
		[gitlabTarget, gitlabSourceTargets, pullRequestTarget],
	);
	return linkedIssues.some((issue) => issue.source === "gitlab") ||
		(linkedPR && pullRequestRefFromUrl(linkedPR.url)?.provider === "gitlab")
		? gitlabApi
		: legacyApi;
}
