import { useCallback, useRef } from "react";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useGitInitDialogStore } from "renderer/stores/git-init-dialog";
import { processOpenNewResults } from "./processOpenNewResults";
import { useOpenFromPath } from "./useOpenFromPath";
import { useOpenNew } from "./useOpenNew";

type Project = ElectronRouterOutputs["projects"]["get"];

interface PendingGitInit {
	paths: string[];
	immediateSuccesses: Project[];
	resolve: (projects: Project[]) => void;
}

export function useOpenProject() {
	const openNewMutation = useOpenNew();
	const openFromPathMutation = useOpenFromPath();
	const initGitAndOpen = electronTrpc.projects.initGitAndOpen.useMutation();
	const utils = electronTrpc.useUtils();

	const pendingRef = useRef<PendingGitInit | null>(null);

	const showDialog = useCallback(
		(pending: PendingGitInit) => {
			pendingRef.current = pending;

			useGitInitDialogStore.getState().open({
				paths: pending.paths,
				onConfirm: async () => {
					const p = pendingRef.current;
					if (!p) return;

					useGitInitDialogStore.getState().setIsPending(true);

					const projects: Project[] = [...p.immediateSuccesses];

					try {
						for (const path of p.paths) {
							try {
								const result = await initGitAndOpen.mutateAsync({ path });
								projects.push(result.project);
							} catch (error) {
								console.error(
									"[useOpenProject] Failed to init git:",
									path,
									error,
								);
							}
						}

						await utils.projects.getRecents.invalidate();
					} finally {
						useGitInitDialogStore.getState().close();
						pendingRef.current = null;
						p.resolve(projects);
					}
				},
				onCancel: () => {
					const p = pendingRef.current;
					if (!p) return;

					useGitInitDialogStore.getState().close();
					pendingRef.current = null;
					p.resolve(p.immediateSuccesses);
				},
			});
		},
		[initGitAndOpen, utils],
	);

	const openNew = useCallback((): Promise<Project[]> => {
		return new Promise((resolve) => {
			openNewMutation.mutate(undefined, {
				onSuccess: (result) => {
					if (result.canceled) {
						resolve([]);
						return;
					}

					if ("error" in result) {
						resolve([]);
						return;
					}

					if ("results" in result) {
						const { successes, needsGitInit } = processOpenNewResults({
							results: result.results,
						});

						const immediateProjects = successes.map((s) => s.project);

						if (needsGitInit.length > 0) {
							showDialog({
								paths: needsGitInit.map((n) => n.selectedPath),
								immediateSuccesses: immediateProjects,
								resolve,
							});
							return;
						}

						resolve(immediateProjects);
						return;
					}

					resolve([]);
				},
				onError: () => {
					resolve([]);
				},
			});
		});
	}, [openNewMutation, showDialog]);

	const openFromPath = useCallback(
		(path: string): Promise<Project | null> => {
			return new Promise((resolve) => {
				openFromPathMutation.mutate(
					{ path },
					{
						onSuccess: (result) => {
							if ("canceled" in result && result.canceled) {
								resolve(null);
								return;
							}

							if ("needsGitInit" in result && result.needsGitInit) {
								showDialog({
									paths: [result.selectedPath],
									immediateSuccesses: [],
									resolve: (projects) => resolve(projects[0] ?? null),
								});
								return;
							}

							if ("error" in result) {
								resolve(null);
								return;
							}

							if ("project" in result) {
								resolve(result.project);
								return;
							}

							resolve(null);
						},
						onError: () => {
							resolve(null);
						},
					},
				);
			});
		},
		[openFromPathMutation, showDialog],
	);

	return {
		openNew,
		openFromPath,
		isPending:
			openNewMutation.isPending ||
			openFromPathMutation.isPending ||
			initGitAndOpen.isPending,
	};
}
