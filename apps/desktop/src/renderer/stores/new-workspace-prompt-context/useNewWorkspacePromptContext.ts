import { useEffect, useMemo } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useRelayUrl } from "renderer/hooks/useRelayUrl";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { buildSubmitPrompt } from "./buildSubmitPrompt";
import {
	fetchInternalTaskBody,
	fetchPrBody,
	fetchRepositoryIssueBody,
} from "./fetchers";
import { issueContextKey } from "./issue-context-key";
import { requestContextKey } from "./request-context-key";
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

	useEffect(() => {
		if (!projectId || !hostUrl) return;
		const store = useNewWorkspacePromptContextStore.getState();

		if (linkedPR) {
			const prNumber = linkedPR.prNumber;
			store.register(requestContextKey(linkedPR, { projectId, hostId }), () =>
				fetchPrBody({
					prNumber,
					projectId,
					hostUrl,
					provider: linkedPR.provider,
					instance: linkedPR.instance,
					repoPath: linkedPR.repoPath,
				}),
			);
		}

		for (const issue of linkedIssues) {
			if (
				(issue.source === "github" || issue.source === "gitlab") &&
				issue.number != null
			) {
				const issueNumber = issue.number;
				const issueHostUrl =
					issue.hostId && activeOrganizationId
						? resolveHostUrl({
								hostId: issue.hostId,
								machineId,
								activeHostUrl,
								organizationId: activeOrganizationId,
								relayUrl,
							})
						: hostUrl;
				store.register(issueContextKey(issue, { projectId, hostId }), () =>
					issue.body !== undefined
						? Promise.resolve({ text: issue.body })
						: issueHostUrl
							? fetchRepositoryIssueBody({
									provider: issue.source === "gitlab" ? "gitlab" : "github",
									issueNumber,
									projectId: issue.projectId ?? projectId,
									hostUrl: issueHostUrl,
									instance: issue.instance,
									repoPath: issue.repoPath,
								})
							: Promise.resolve(null),
				);
			} else if (issue.source === "internal" && issue.taskId) {
				const taskId = issue.taskId;
				store.register(`task:${taskId}`, () =>
					fetchInternalTaskBody({ taskId }),
				);
			}
		}
	}, [
		projectId,
		hostId,
		hostUrl,
		linkedPR,
		linkedIssues,
		activeOrganizationId,
		machineId,
		activeHostUrl,
		relayUrl,
	]);

	return useMemo<NewWorkspacePromptContextApi>(
		() => ({
			build: async (buildArgs) => {
				await useNewWorkspacePromptContextStore
					.getState()
					.awaitPending(buildArgs.timeoutMs);
				return buildSubmitPrompt({
					userPrompt: buildArgs.userPrompt,
					linkedPR: buildArgs.linkedPR,
					linkedIssues: buildArgs.linkedIssues,
					projectId,
					hostId,
				});
			},
		}),
		[projectId, hostId],
	);
}
