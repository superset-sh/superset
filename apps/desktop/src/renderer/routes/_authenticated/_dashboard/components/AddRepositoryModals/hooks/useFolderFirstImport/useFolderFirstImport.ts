import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { getBaseName } from "renderer/lib/pathBasename";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface UseFolderFirstImportResult {
	start: () => Promise<void>;
}

export function useFolderFirstImport(options?: {
	onSuccess?: (result: { projectId: string; repoPath: string }) => void;
	onError?: (message: string) => void;
}): UseFolderFirstImportResult {
	const { activeHostUrl } = useLocalHostService();
	const { ensureProjectInSidebar } = useDashboardSidebarState();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const reportSuccess = useCallback(
		(result: { projectId: string; repoPath: string }) => {
			ensureProjectInSidebar(result.projectId);
			options?.onSuccess?.(result);
		},
		[ensureProjectInSidebar, options],
	);

	const reportError = useCallback(
		(message: string) => {
			options?.onError?.(message);
		},
		[options],
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
		let candidates: Array<{ id: string }>;
		try {
			const response = await client.project.findByPath.query({ repoPath });
			candidates = response.candidates;
		} catch (err) {
			reportError(err instanceof Error ? err.message : String(err));
			return;
		}

		const [only, ...rest] = candidates;
		if (rest.length > 0) {
			// Unreachable given single-org findByGitHubRemote + the unique
			// index on (organizationId, lower(repoCloneUrl)). Surface loudly
			// if we ever hit it — means the invariants broke.
			reportError(
				`Multiple matching projects returned (${candidates.length}) — please report this`,
			);
			return;
		}

		try {
			if (only) {
				const result = await client.project.setup.mutate({
					projectId: only.id,
					mode: { kind: "import", repoPath },
				});
				reportSuccess({ projectId: only.id, repoPath: result.repoPath });
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
	}, [activeHostUrl, reportError, reportSuccess, selectDirectory]);

	return { start };
}
