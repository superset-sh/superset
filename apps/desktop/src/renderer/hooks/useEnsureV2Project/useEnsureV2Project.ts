import { useCallback } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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
	const { activeHostUrl } = useLocalHostService();

	return useCallback(
		async ({ repoPath, name }) => {
			if (!activeHostUrl) {
				throw new Error("No active host service");
			}
			const hostService = getHostServiceClientByUrl(activeHostUrl);

			const found = await hostService.project.findByPath.query({ repoPath });
			const candidate = found.candidates[0];
			if (candidate) {
				try {
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
				} catch (err) {
					// findByPath returns local sqlite rows even when no cloud v2 project
					// exists for that id; setup → v2Project.get → NOT_FOUND. Only that
					// case is safe to fall through to create — every other error
					// (network, auth, 5xx) must propagate so retries don't silently mint
					// duplicate cloud projects.
					const code = (err as { data?: { code?: string } } | null | undefined)
						?.data?.code;
					if (code !== "NOT_FOUND") {
						throw err;
					}
				}
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
		[activeHostUrl],
	);
}
