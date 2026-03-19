import { useCallback, useRef } from "react";
import type { ElectronRouterOutputs } from "renderer/lib/electron-trpc";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useGitInitDialogStore } from "renderer/stores/git-init-dialog";
import { useWorktreeChoiceDialogStore } from "renderer/stores/worktree-choice-dialog";
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
	const updateProject = electronTrpc.projects.update.useMutation();
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

	/** Show worktree choice dialog for each newly opened project. */
	const maybePromptWorktreeChoice = useCallback(
		async (newProjects: Project[]): Promise<void> => {
			if (newProjects.length === 0) return;

			for (const project of newProjects) {
				// Skip projects that already have a worktreeMode set
				if (project.worktreeMode) continue;

				await new Promise<void>((resolveChoice) => {
					useWorktreeChoiceDialogStore.getState().open({
						projectName: project.name,
						onChoice: async (enableWorktrees) => {
							if (!enableWorktrees) {
								await updateProject.mutateAsync({
									id: project.id,
									patch: { worktreeMode: "disabled" },
								});
								await utils.workspaces.getAllGrouped.invalidate();
							}
							resolveChoice();
						},
					});
				});
			}
		},
		[updateProject, utils],
	);

	const openNew = useCallback((): Promise<Project[]> => {
		return new Promise((resolve) => {
			openNewMutation.mutate(undefined, {
				onSuccess: async (result) => {
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
								resolve: async (allProjects) => {
									await maybePromptWorktreeChoice(allProjects);
									resolve(allProjects);
								},
							});
							return;
						}

						await maybePromptWorktreeChoice(immediateProjects);
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
	}, [maybePromptWorktreeChoice, openNewMutation, showDialog]);

	/** Opens a folder picker and auto-initializes git if needed (no dialog). */
	const openNewWithoutGit = useCallback((): Promise<Project[]> => {
		return new Promise((resolve) => {
			openNewMutation.mutate(undefined, {
				onSuccess: async (result) => {
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

						const allProjects = successes.map((s) => s.project);

						// Auto-init git for any folders that need it (skip the dialog)
						for (const item of needsGitInit) {
							try {
								const initiated = await initGitAndOpen.mutateAsync({
									path: item.selectedPath,
								});
								allProjects.push(initiated.project);
							} catch (error) {
								console.error(
									"[useOpenProject] Failed to auto-init git:",
									item.selectedPath,
									error,
								);
							}
						}

						if (allProjects.length > 0) {
							await utils.projects.getRecents.invalidate();
						}

						resolve(allProjects);
						return;
					}

					resolve([]);
				},
				onError: () => {
					resolve([]);
				},
			});
		});
	}, [initGitAndOpen, openNewMutation, utils]);

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
		openNewWithoutGit,
		openFromPath,
		isPending:
			openNewMutation.isPending ||
			openFromPathMutation.isPending ||
			initGitAndOpen.isPending,
	};
}
