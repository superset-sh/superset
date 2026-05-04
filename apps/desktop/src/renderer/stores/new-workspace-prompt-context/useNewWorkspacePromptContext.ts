import { useEffect, useMemo } from "react";
import { resolveHostUrl } from "renderer/hooks/host-service/useHostTargetUrl";
import { authClient } from "renderer/lib/auth-client";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import type {
	LinkedIssue,
	LinkedPR,
} from "renderer/stores/new-workspace-draft";
import { buildSubmitPrompt } from "./buildSubmitPrompt";
import {
	fetchGitHubIssueBody,
	fetchInternalTaskBody,
	fetchPrBody,
} from "./fetchers";
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
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId ?? null;

	const hostUrl = useMemo(() => {
		const id = hostId ?? machineId;
		if (!id || !activeOrganizationId) return null;
		return resolveHostUrl({
			hostId: id,
			machineId,
			activeHostUrl,
			organizationId: activeOrganizationId,
		});
	}, [hostId, machineId, activeHostUrl, activeOrganizationId]);

	useEffect(() => {
		if (!projectId || !hostUrl) return;
		const store = useNewWorkspacePromptContextStore.getState();

		if (linkedPR) {
			const prNumber = linkedPR.prNumber;
			store.register(`pr:${prNumber}`, () =>
				fetchPrBody({ prNumber, projectId, hostUrl }),
			);
		}

		for (const issue of linkedIssues) {
			if (issue.source === "github" && issue.number != null) {
				const issueNumber = issue.number;
				store.register(`github-issue:${issueNumber}`, () =>
					fetchGitHubIssueBody({ issueNumber, projectId, hostUrl }),
				);
			} else if (issue.source === "internal" && issue.taskId) {
				const taskId = issue.taskId;
				store.register(`task:${taskId}`, () =>
					fetchInternalTaskBody({ taskId }),
				);
			}
		}
	}, [projectId, hostUrl, linkedPR, linkedIssues]);

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
				});
			},
		}),
		[],
	);
}
