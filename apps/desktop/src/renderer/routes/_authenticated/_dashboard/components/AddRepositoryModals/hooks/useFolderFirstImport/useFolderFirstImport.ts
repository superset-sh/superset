import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";

export interface FolderImportCandidate {
	id: string;
	name: string;
	slug: string;
	organizationId: string;
	organizationName: string;
}

// idle      — no modal.
// no-match  — picked folder has no cloud project; user names it.
// pick      — multiple candidates; user picks which cloud project.
// (1-match has no state — setup runs immediately.)
export type FolderFirstImportState =
	| { kind: "idle" }
	| { kind: "no-match"; repoPath: string; working: boolean }
	| {
			kind: "pick";
			repoPath: string;
			candidates: FolderImportCandidate[];
			working: boolean;
	  };

export interface UseFolderFirstImportResult {
	state: FolderFirstImportState;
	start: () => Promise<void>;
	/** No-op while a mutation is working. */
	cancel: () => void;
	confirmCreateAsNew: (input: { name: string }) => Promise<void>;
	confirmPickCandidate: (candidateId: string) => Promise<void>;
}

type SetupInvokeResult =
	| { status: "ok"; projectId: string; repoPath: string }
	| { status: "error"; message: string };

export function useFolderFirstImport(options?: {
	onSuccess?: (result: { projectId: string; repoPath: string }) => void;
	onError?: (message: string) => void;
}): UseFolderFirstImportResult {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const { ensureProjectInSidebar } = useDashboardSidebarState();
	const selectDirectory = electronTrpc.window.selectDirectory.useMutation();

	const [state, setState] = useState<FolderFirstImportState>({ kind: "idle" });

	const reset = useCallback(() => setState({ kind: "idle" }), []);

	const invalidateProjectList = useCallback(() => {
		// Keep in sync with useDashboardSidebarData.
		queryClient.invalidateQueries({
			queryKey: ["project", "list", activeHostUrl],
		});
	}, [queryClient, activeHostUrl]);

	const reportSuccess = useCallback(
		(result: { projectId: string; repoPath: string }) => {
			ensureProjectInSidebar(result.projectId);
			invalidateProjectList();
			options?.onSuccess?.(result);
			reset();
		},
		[ensureProjectInSidebar, invalidateProjectList, options, reset],
	);

	const reportError = useCallback(
		(message: string) => {
			options?.onError?.(message);
		},
		[options],
	);

	const runSetup = useCallback(
		async (projectId: string, repoPath: string): Promise<SetupInvokeResult> => {
			if (!activeHostUrl) {
				return { status: "error", message: "Host service not available" };
			}
			const client = getHostServiceClientByUrl(activeHostUrl);
			try {
				const result = await client.project.setup.mutate({
					projectId,
					mode: { kind: "import", repoPath },
				});
				return { status: "ok", projectId, repoPath: result.repoPath };
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				return { status: "error", message };
			}
		},
		[activeHostUrl],
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
		let candidates: FolderImportCandidate[];
		try {
			const response = await client.project.findByPath.query({ repoPath });
			candidates = response.candidates;
		} catch (err) {
			reportError(err instanceof Error ? err.message : String(err));
			return;
		}

		if (candidates.length === 0) {
			setState({ kind: "no-match", repoPath, working: false });
			return;
		}
		const [only, ...rest] = candidates;
		if (only && rest.length === 0) {
			const result = await runSetup(only.id, repoPath);
			if (result.status === "ok") {
				reportSuccess(result);
			} else {
				reportError(result.message);
			}
			return;
		}
		setState({ kind: "pick", repoPath, candidates, working: false });
	}, [activeHostUrl, reportError, reportSuccess, runSetup, selectDirectory]);

	const cancel = useCallback(() => {
		setState((prev) => {
			// Don't drop the modal while a mutation is mid-flight; the user will
			// see the disabled state and wait, or the mutation will resolve and
			// reset us.
			if (prev.kind !== "idle" && prev.working) return prev;
			return { kind: "idle" };
		});
	}, []);

	const confirmCreateAsNew = useCallback(
		async ({ name }: { name: string }) => {
			if (state.kind !== "no-match") return;
			if (!activeHostUrl) {
				reportError("Host service not available");
				return;
			}
			const repoPath = state.repoPath;
			setState({ kind: "no-match", repoPath, working: true });
			const client = getHostServiceClientByUrl(activeHostUrl);
			try {
				const result = await client.project.create.mutate({
					name,
					mode: { kind: "importLocal", repoPath },
				});
				reportSuccess(result);
			} catch (err) {
				reportError(err instanceof Error ? err.message : String(err));
				setState({ kind: "no-match", repoPath, working: false });
			}
		},
		[activeHostUrl, reportError, reportSuccess, state],
	);

	const confirmPickCandidate = useCallback(
		async (candidateId: string) => {
			if (state.kind !== "pick") return;
			const { repoPath, candidates } = state;
			setState({ kind: "pick", repoPath, candidates, working: true });
			const result = await runSetup(candidateId, repoPath);
			if (result.status === "ok") {
				reportSuccess(result);
			} else {
				reportError(result.message);
				setState({ kind: "pick", repoPath, candidates, working: false });
			}
		},
		[reportError, reportSuccess, runSetup, state],
	);

	return {
		state,
		start,
		cancel,
		confirmCreateAsNew,
		confirmPickCandidate,
	};
}
