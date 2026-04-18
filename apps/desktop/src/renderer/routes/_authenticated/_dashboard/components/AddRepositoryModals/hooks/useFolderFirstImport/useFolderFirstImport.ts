import { useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
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

/**
 * State machine for the folder-first import flow.
 *
 * idle             — no modal.
 * no-match         — picked folder has no cloud project; user names it to
 *                    create.
 * pick             — multiple candidates; user picks which cloud project to
 *                    bind.
 * confirm-repoint  — the target project is already set up on this host at
 *                    some other path. Re-pointing would invalidate existing
 *                    workspaces; user must explicitly acknowledge.
 *
 * The 1-match case without a conflict has no state here — we run setup
 * immediately without a modal because there's nothing to disambiguate.
 */
export type FolderFirstImportState =
	| { kind: "idle" }
	| { kind: "no-match"; repoPath: string; working: boolean }
	| {
			kind: "pick";
			repoPath: string;
			candidates: FolderImportCandidate[];
			working: boolean;
	  }
	| {
			kind: "confirm-repoint";
			repoPath: string;
			projectId: string;
			projectName: string;
			working: boolean;
	  };

export interface UseFolderFirstImportResult {
	state: FolderFirstImportState;
	/** Open the native picker and branch on candidate count. */
	start: () => Promise<void>;
	/** Close the modal. No-op while a mutation is working. */
	cancel: () => void;
	/** no-match branch: user confirmed a project name → create as new. */
	confirmCreateAsNew: (input: { name: string }) => Promise<void>;
	/** pick branch: user selected one of the candidates → run setup. */
	confirmPickCandidate: (candidateId: string) => Promise<void>;
	/** confirm-repoint branch: user accepts workspace invalidation → retry. */
	confirmRepoint: () => Promise<void>;
}

type SetupInvokeResult =
	| { status: "ok"; projectId: string; repoPath: string }
	| { status: "conflict" }
	| { status: "error"; message: string };

function isConflictError(err: unknown): boolean {
	return (
		err instanceof TRPCClientError &&
		(err.data as { code?: string } | undefined)?.code === "CONFLICT"
	);
}

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
		async (
			projectId: string,
			repoPath: string,
			opts: { acknowledgeWorkspaceInvalidation?: boolean } = {},
		): Promise<SetupInvokeResult> => {
			if (!activeHostUrl) {
				return { status: "error", message: "Host service not available" };
			}
			const client = getHostServiceClientByUrl(activeHostUrl);
			try {
				const result = await client.project.setup.mutate({
					projectId,
					acknowledgeWorkspaceInvalidation:
						opts.acknowledgeWorkspaceInvalidation,
					mode: { kind: "import", repoPath },
				});
				return { status: "ok", projectId, repoPath: result.repoPath };
			} catch (err) {
				if (isConflictError(err)) return { status: "conflict" };
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

		const picked = await selectDirectory.mutateAsync({
			title: "Import existing folder",
		});
		if (picked.canceled || !picked.path) return;
		const repoPath = picked.path;

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
			// Auto-advance: no ambiguity, no user input needed — unless the
			// project is already set up on this host at a different path.
			const result = await runSetup(only.id, repoPath);
			if (result.status === "ok") {
				reportSuccess(result);
			} else if (result.status === "conflict") {
				setState({
					kind: "confirm-repoint",
					repoPath,
					projectId: only.id,
					projectName: only.name,
					working: false,
				});
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
					visibility: "private",
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
			const candidate = candidates.find((c) => c.id === candidateId);
			setState({ kind: "pick", repoPath, candidates, working: true });
			const result = await runSetup(candidateId, repoPath);
			if (result.status === "ok") {
				reportSuccess(result);
			} else if (result.status === "conflict") {
				setState({
					kind: "confirm-repoint",
					repoPath,
					projectId: candidateId,
					projectName: candidate?.name ?? "this project",
					working: false,
				});
			} else {
				reportError(result.message);
				setState({ kind: "pick", repoPath, candidates, working: false });
			}
		},
		[reportError, reportSuccess, runSetup, state],
	);

	const confirmRepoint = useCallback(async () => {
		if (state.kind !== "confirm-repoint") return;
		const { repoPath, projectId, projectName } = state;
		setState({
			kind: "confirm-repoint",
			repoPath,
			projectId,
			projectName,
			working: true,
		});
		const result = await runSetup(projectId, repoPath, {
			acknowledgeWorkspaceInvalidation: true,
		});
		if (result.status === "ok") {
			reportSuccess(result);
		} else {
			const message =
				result.status === "conflict"
					? "Unexpected conflict after acknowledging re-point"
					: result.message;
			reportError(message);
			setState({
				kind: "confirm-repoint",
				repoPath,
				projectId,
				projectName,
				working: false,
			});
		}
	}, [reportError, reportSuccess, runSetup, state]);

	return {
		state,
		start,
		cancel,
		confirmCreateAsNew,
		confirmPickCandidate,
		confirmRepoint,
	};
}
