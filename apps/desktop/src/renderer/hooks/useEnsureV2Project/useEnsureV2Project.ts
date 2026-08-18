import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getHostServiceUnavailableMessage } from "renderer/lib/host-service-unavailable";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface EnsureV2ProjectResult {
	hostUrl: string;
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string | null;
}

export function useEnsureV2Project(): (args: {
	repoPath: string;
	name: string;
}) => Promise<EnsureV2ProjectResult> {
	const hostServiceContext = useLocalHostService();
	const { activeHostUrl } = hostServiceContext;

	return useCallback(
		async ({ repoPath, name }) => {
			if (!activeHostUrl) {
				throw new Error(
					getHostServiceUnavailableMessage(hostServiceContext, {
						action: "import the project",
					}),
				);
			}
			const hostService = getHostServiceClientByUrl(activeHostUrl);

			// findByPath is local-only: a candidate means this host already has
			// the project, so setup just re-ensures the main workspace.
			const found = await hostService.project.findByPath.query({ repoPath });
			const candidate = found.candidates[0];
			if (candidate) {
				const setupResult = await hostService.project.setup.mutate({
					projectId: candidate.id,
					mode: { kind: "import", repoPath },
				});
				return {
					hostUrl: activeHostUrl,
					projectId: candidate.id,
					repoPath: setupResult.repoPath,
					mainWorkspaceId: setupResult.mainWorkspaceId,
				};
			}

			const created = await hostService.project.create.mutate({
				name,
				mode: { kind: "importLocal", repoPath },
			});
			return {
				hostUrl: activeHostUrl,
				projectId: created.projectId,
				repoPath: created.repoPath,
				mainWorkspaceId: created.mainWorkspaceId,
			};
		},
		[activeHostUrl, hostServiceContext],
	);
}
