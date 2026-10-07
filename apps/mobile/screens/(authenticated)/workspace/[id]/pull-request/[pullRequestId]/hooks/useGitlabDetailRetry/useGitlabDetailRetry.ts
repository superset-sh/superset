import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { hostServiceUrl } from "@/lib/host-service/client";
import { gitlabPullRequestFromUrl } from "@/lib/pull-request-links";
import { gitlabPullRequestIdentity } from "../../../../hooks/useWorkspacePullRequestDetail/identity";
import { useWorkspaceRepo } from "../../../../hooks/useWorkspaceRepo";
export function useGitlabDetailRetry({
	workspaceId,
	owner,
	repo,
	pullNumber,
	refetch,
}: {
	workspaceId: string | null;
	owner: string | null;
	repo: string | null;
	pullNumber: number | null;
	refetch: () => Promise<unknown>;
}) {
	const params = useLocalSearchParams<{
		provider?: string;
		expectedUrl?: string;
	}>();
	const { workspace, host } = useWorkspaceHost(workspaceId);
	const workspaceRepo = useWorkspaceRepo(workspaceId);
	const identity = workspaceRepo.isReady
		? gitlabPullRequestIdentity({
				expectedUrl: params.expectedUrl,
				repoUrl: workspaceRepo.repoUrl,
				owner,
				repo,
				pullNumber,
			})
		: null;
	const parsed = params.expectedUrl
		? gitlabPullRequestFromUrl(params.expectedUrl)
		: null;
	let key: string | null = null;
	if (
		identity &&
		parsed &&
		parsed.expectedUrl === params.expectedUrl &&
		parsed.owner === owner &&
		parsed.repo === repo &&
		parsed.pullNumber === pullNumber &&
		params.provider !== "github" &&
		workspace &&
		workspace.id === workspaceId &&
		workspace.projectId &&
		host?.isOnline === true
	) {
		key = JSON.stringify([
			host.organizationId,
			hostServiceUrl(host.organizationId, host.machineId),
			workspaceId,
			workspace.projectId,
			parsed.host,
			owner,
			repo,
			pullNumber,
			params.expectedUrl,
		]);
	}
	const latest = useRef(key);
	latest.current = key;
	const live = useRef(true);
	useEffect(() => {
		live.current = true;
		latest.current = key;
		return () => {
			live.current = false;
			latest.current = null;
		};
	}, [key]);
	return {
		canRetry: key !== null,
		retry: () => {
			if (!live.current || key === null || latest.current !== key) return;
			void refetch();
		},
	};
}
