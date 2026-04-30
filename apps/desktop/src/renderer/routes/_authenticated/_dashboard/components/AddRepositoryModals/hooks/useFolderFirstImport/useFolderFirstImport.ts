import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import {
	type ProjectSetupResult,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface UseFolderFirstImportResult {
	start: () => Promise<ProjectSetupResult | null>;
}

interface MatchingProject {
	id: string;
	name: string;
}

export function useFolderFirstImport(options?: {
	onError?: (message: string) => void;
	onMultipleProjects?: (input: { candidates: MatchingProject[] }) => void;
}): UseFolderFirstImportResult {
	const { activeHostUrl } = useLocalHostService();
	const finalizeSetup = useFinalizeProjectSetup();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();
	const { onError, onMultipleProjects } = options ?? {};

	const start = useCallback(async (): Promise<ProjectSetupResult | null> => {
		if (!activeHostUrl) {
			onError?.("Host service not available");
			return null;
		}

		let repoPath: string;
		try {
			const picked = await selectDirectory.mutateAsync({
				title: "Import existing folder",
			});
			if (picked.canceled || !picked.path) return null;
			repoPath = picked.path;
		} catch (err) {
			onError?.(err instanceof Error ? err.message : String(err));
			return null;
		}

		const client = getHostServiceClientByUrl(activeHostUrl);
		let candidates: MatchingProject[];
		try {
			const response = await client.project.findByPath.query({ repoPath });
			candidates = response.candidates;
		} catch (err) {
			onError?.(err instanceof Error ? err.message : String(err));
			return null;
		}

		const [only, ...rest] = candidates;
		if (rest.length > 0) {
			if (onMultipleProjects) {
				onMultipleProjects({ candidates });
			} else {
				onError?.(
					`Multiple projects use this repository (${candidates.length}). Open the project you want from settings to set it up on this device.`,
				);
			}
			return null;
		}

		try {
			let result: ProjectSetupResult;
			if (only) {
				const setupResult = await client.project.setup.mutate({
					projectId: only.id,
					mode: { kind: "import", repoPath },
				});
				result = {
					projectId: only.id,
					repoPath: setupResult.repoPath,
					mainWorkspaceId: setupResult.mainWorkspaceId,
				};
			} else {
				result = await client.project.create.mutate({
					name: getBaseName(repoPath),
					mode: { kind: "importLocal", repoPath },
				});
			}
			finalizeSetup(activeHostUrl, result);
			return result;
		} catch (err) {
			onError?.(err instanceof Error ? err.message : String(err));
			return null;
		}
	}, [
		activeHostUrl,
		finalizeSetup,
		onError,
		onMultipleProjects,
		selectDirectory,
	]);

	return { start };
}
