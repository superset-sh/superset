import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

interface ProjectSetupResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string | null;
}

export interface UseFolderFirstImportResult {
	start: () => Promise<void>;
}

interface MatchingProject {
	id: string;
	name: string;
}

export function useFolderFirstImport(options?: {
	onSuccess?: (result: ProjectSetupResult) => void;
	onError?: (message: string) => void;
	onMultipleProjects?: (input: { candidates: MatchingProject[] }) => void;
}): UseFolderFirstImportResult {
	const { activeHostUrl } = useLocalHostService();
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { onError, onMultipleProjects, onSuccess } = options ?? {};

	const reportSuccess = useCallback(
		(result: ProjectSetupResult) => {
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, result.projectId);
			} else {
				ensureProjectInSidebar(result.projectId);
			}
			onSuccess?.(result);
		},
		[ensureProjectInSidebar, ensureWorkspaceInSidebar, onSuccess],
	);

	const reportError = useCallback(
		(message: string) => {
			onError?.(message);
		},
		[onError],
	);

	const start = useCallback(async () => {
		if (!activeHostUrl) {
			reportError("Host service not available");
			return;
		}

		let repoPath: string;
		try {
			const picked = await selectDirectory.mutateAsync({
				title: "Import existing folder",
			});
			if (picked.canceled || !picked.path) return;
			repoPath = picked.path;
		} catch (err) {
			reportError(err instanceof Error ? err.message : String(err));
			return;
		}

		const client = getHostServiceClientByUrl(activeHostUrl);
		let candidates: MatchingProject[];
		try {
			const response = await client.project.findByPath.query({ repoPath });
			candidates = response.candidates;
		} catch (err) {
			reportError(err instanceof Error ? err.message : String(err));
			return;
		}

		const [only, ...rest] = candidates;
		if (rest.length > 0) {
			if (onMultipleProjects) {
				onMultipleProjects({ candidates });
			} else {
				reportError(
					`Multiple projects use this repository (${candidates.length}). Open the project you want from settings to set it up on this device.`,
				);
			}
			return;
		}

		try {
			if (only) {
				const result = await client.project.setup.mutate({
					projectId: only.id,
					mode: { kind: "import", repoPath },
				});
				reportSuccess({
					projectId: only.id,
					repoPath: result.repoPath,
					mainWorkspaceId: result.mainWorkspaceId,
				});
			} else {
				const result = await client.project.create.mutate({
					name: getBaseName(repoPath),
					mode: { kind: "importLocal", repoPath },
				});
				reportSuccess(result);
			}
		} catch (err) {
			reportError(err instanceof Error ? err.message : String(err));
		}
	}, [
		activeHostUrl,
		onMultipleProjects,
		reportError,
		reportSuccess,
		selectDirectory,
	]);

	return { start };
}
