import { Checkbox } from "@superset/ui/checkbox";
import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { useEnsureV2Project } from "renderer/hooks/useEnsureV2Project";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useFinalizeProjectSetup } from "renderer/react-query/projects/useFinalizeProjectSetup";
import { useImportExternalWorktrees } from "renderer/react-query/workspaces/useImportExternalWorktrees";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { useWorkspaceCreates } from "renderer/stores/workspace-creates";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell } from "../components/StepShell";
import {
	countSelected,
	initializeProjectSelection,
	type SelectionState,
	togglePathInSelection,
	toggleProjectInSelection,
} from "./utils/selection";

export const Route = createFileRoute("/_authenticated/setup/adopt-worktrees/")({
	component: OnboardingAdoptWorktreesPage,
});

interface ExternalWorktree {
	path: string;
	branch: string;
}

function OnboardingAdoptWorktreesPage() {
	const navigate = useNavigate();
	const goTo = useOnboardingStore((s) => s.goTo);
	const markComplete = useOnboardingStore((s) => s.markComplete);
	const markSkipped = useOnboardingStore((s) => s.markSkipped);
	const manualWalkthrough = useOnboardingStore((s) => s.manualWalkthrough);
	const setManualWalkthrough = useOnboardingStore(
		(s) => s.setManualWalkthrough,
	);

	const utils = electronTrpc.useUtils();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { data: projects, isPending } =
		electronTrpc.projects.getRecents.useQuery();

	useEffect(() => {
		goTo("adopt-worktrees");
	}, [goTo]);

	const navigateAfterFlow = useCallback(
		async (replace: boolean, importedV2WorkspaceId?: string) => {
			if (isV2CloudEnabled) {
				if (importedV2WorkspaceId) {
					navigate({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId: importedV2WorkspaceId },
						replace,
					});
					return;
				}
				const project = projects?.[0];
				if (project) {
					navigate({
						to: "/project/$projectId",
						params: { projectId: project.id },
						replace,
					});
					return;
				}
				navigate({ to: "/welcome", replace });
				return;
			}
			try {
				const grouped = await utils.workspaces.getAllGrouped.fetch();
				const allWorkspaces = grouped.flatMap((g) => g.workspaces);
				const lastViewedId = localStorage.getItem("lastViewedWorkspaceId");
				const target =
					allWorkspaces.find((w) => w.id === lastViewedId) ?? allWorkspaces[0];
				if (target) {
					navigate({
						to: "/workspace/$workspaceId",
						params: { workspaceId: target.id },
						replace,
					});
					return;
				}
			} catch {
				// fall through to project / welcome routing
			}
			const project = projects?.[0];
			if (project) {
				navigate({
					to: "/project/$projectId",
					params: { projectId: project.id },
					replace,
				});
				return;
			}
			navigate({ to: "/welcome", replace });
		},
		[utils, isV2CloudEnabled, navigate, projects],
	);

	const finishFlow = useCallback(
		(importedV2WorkspaceId?: string) => {
			const startedAt = useOnboardingStore.getState().startedAt;
			track("onboarding_finished", {
				outcome: "completed",
				duration_ms: startedAt ? Date.now() - startedAt : null,
			});
			markComplete("adopt-worktrees");
			setManualWalkthrough(false);
			void navigateAfterFlow(true, importedV2WorkspaceId);
		},
		[markComplete, setManualWalkthrough, navigateAfterFlow],
	);

	const skipFlow = useCallback(() => {
		const startedAt = useOnboardingStore.getState().startedAt;
		track("onboarding_finished", {
			outcome: "skipped",
			duration_ms: startedAt ? Date.now() - startedAt : null,
		});
		markSkipped("adopt-worktrees");
		setManualWalkthrough(false);
		void navigateAfterFlow(true);
	}, [markSkipped, setManualWalkthrough, navigateAfterFlow]);

	if (isPending) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-[#151110]">
				<Spinner className="size-6 text-[#a8a5a3]" />
			</div>
		);
	}

	if (!projects || projects.length === 0) {
		return <AutoAdvance onAdvance={finishFlow} />;
	}

	return (
		<AdoptWorktreesContent
			projects={projects.map((p) => ({
				id: p.id,
				name: p.name,
				mainRepoPath: p.mainRepoPath,
			}))}
			onSkip={skipFlow}
			onFinish={finishFlow}
			manualWalkthrough={manualWalkthrough}
		/>
	);
}

function AutoAdvance({ onAdvance }: { onAdvance: () => void }) {
	useEffect(() => {
		onAdvance();
	}, [onAdvance]);
	return (
		<div className="flex h-full w-full items-center justify-center bg-[#151110]">
			<Spinner className="size-6 text-[#a8a5a3]" />
		</div>
	);
}

interface ProjectResult {
	worktrees: ExternalWorktree[];
	loaded: boolean;
}

interface AdoptWorktreesContentProps {
	projects: { id: string; name: string; mainRepoPath: string }[];
	onSkip: () => void;
	onFinish: (importedV2WorkspaceId?: string) => void;
	manualWalkthrough: boolean;
}

function AdoptWorktreesContent({
	projects,
	onSkip,
	onFinish,
	manualWalkthrough,
}: AdoptWorktreesContentProps) {
	const importExternalWorktrees = useImportExternalWorktrees();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { submit } = useWorkspaceCreates();
	const { machineId, activeHostUrl } = useLocalHostService();
	const ensureV2Project = useEnsureV2Project();
	const finalizeProjectSetup = useFinalizeProjectSetup();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const [results, setResults] = useState<Record<string, ProjectResult>>({});
	const [selected, setSelected] = useState<SelectionState>({});
	const [isV2Importing, setIsV2Importing] = useState(false);
	const [v2Progress, setV2Progress] = useState<{
		current: number;
		total: number;
	} | null>(null);
	const v2NeedsHost = isV2CloudEnabled && !activeHostUrl;

	const allLoaded = projects.every((p) => results[p.id]?.loaded);
	const total = useMemo(
		() =>
			Object.values(results).reduce(
				(acc, r) => acc + (r.loaded ? r.worktrees.length : 0),
				0,
			),
		[results],
	);
	const totalSelected = useMemo(() => countSelected(selected), [selected]);

	useEffect(() => {
		if (allLoaded && total === 0 && !manualWalkthrough) onFinish();
	}, [allLoaded, total, manualWalkthrough, onFinish]);

	const handleResult = useCallback(
		(projectId: string, worktrees: ExternalWorktree[]) => {
			setResults((prev) => ({
				...prev,
				[projectId]: { worktrees, loaded: true },
			}));
			setSelected((prev) =>
				initializeProjectSelection(
					prev,
					projectId,
					worktrees.map((wt) => wt.path),
				),
			);
		},
		[],
	);

	const togglePath = useCallback((projectId: string, path: string) => {
		setSelected((prev) => togglePathInSelection(prev, projectId, path));
	}, []);

	const toggleProject = useCallback(
		(projectId: string) => {
			setSelected((prev) => {
				const projectResult = results[projectId];
				if (!projectResult) return prev;
				return toggleProjectInSelection(
					prev,
					projectId,
					projectResult.worktrees.map((wt) => wt.path),
				);
			});
		},
		[results],
	);

	const handleImportSelected = async () => {
		let totalImported = 0;
		let firstImportedV2Id: string | undefined;

		if (isV2CloudEnabled) {
			if (!machineId) {
				toast.error("No active host");
				return;
			}
			const totalToImport = totalSelected;
			setIsV2Importing(true);
			setV2Progress({ current: 0, total: totalToImport });
			try {
				for (const project of projects) {
					const paths = Array.from(selected[project.id] ?? []);
					if (paths.length === 0) continue;
					const projectResult = results[project.id];
					if (!projectResult) continue;

					let v2ProjectId: string;
					try {
						const ensureResult = await ensureV2Project({
							repoPath: project.mainRepoPath,
							name: project.name,
						});
						v2ProjectId = ensureResult.projectId;
						finalizeProjectSetup(ensureResult.hostUrl, {
							projectId: ensureResult.projectId,
							repoPath: ensureResult.repoPath,
							mainWorkspaceId: ensureResult.mainWorkspaceId,
						});
					} catch (err) {
						toast.error(
							err instanceof Error
								? `Could not link "${project.name}" to v2: ${err.message}`
								: `Could not link "${project.name}" to v2`,
						);
						continue;
					}

					for (const path of paths) {
						const wt = projectResult.worktrees.find((w) => w.path === path);
						if (!wt) continue;
						const result = await submit({
							hostId: machineId,
							snapshot: {
								id: crypto.randomUUID(),
								projectId: v2ProjectId,
								name: wt.branch,
								branch: wt.branch,
							},
						});
						if (result.ok) {
							totalImported++;
							firstImportedV2Id = firstImportedV2Id ?? result.workspaceId;
							ensureWorkspaceInSidebar(result.workspaceId, v2ProjectId);
						} else {
							toast.error(`Failed to import ${wt.branch}: ${result.error}`);
						}
						setV2Progress({ current: totalImported, total: totalToImport });
					}
				}
			} finally {
				setIsV2Importing(false);
				setV2Progress(null);
			}
		} else {
			for (const project of projects) {
				const paths = Array.from(selected[project.id] ?? []);
				if (paths.length === 0) continue;
				try {
					const result = await importExternalWorktrees.mutateAsync({
						projectId: project.id,
						paths,
					});
					totalImported += result.imported;
				} catch (err) {
					toast.error(
						err instanceof Error
							? err.message
							: `Failed to import worktrees for ${project.name}`,
					);
				}
			}
		}

		if (totalImported > 0) {
			toast.success(
				`Imported ${totalImported} workspace${totalImported === 1 ? "" : "s"}`,
			);
		}
		onFinish(firstImportedV2Id);
	};

	const nothingToAdopt = allLoaded && total === 0;

	return (
		<StepShell backTo={STEP_ROUTES.project} maxWidth="lg">
			<StepHeader
				title="Adopt existing worktrees"
				subtitle={
					isV2Importing && v2Progress
						? `Creating ${v2Progress.current} of ${v2Progress.total} workspace${v2Progress.total === 1 ? "" : "s"} in v2…`
						: !allLoaded
							? "Scanning your projects for unadopted worktrees…"
							: nothingToAdopt
								? "All worktrees on disk are already tracked."
								: `Found ${total} worktree${total === 1 ? "" : "s"} on disk that aren't yet tracked.`
				}
			/>

			{!nothingToAdopt && (
				<div className="overflow-hidden rounded-lg border border-[#2a2827] bg-[#201e1c]">
					<div className="max-h-[420px] divide-y divide-[#2a2827] overflow-y-auto">
						{projects.map((project) => (
							<ProjectWorktrees
								key={project.id}
								projectId={project.id}
								projectName={project.name}
								selectedPaths={selected[project.id]}
								onResult={(worktrees) => handleResult(project.id, worktrees)}
								onTogglePath={(path) => togglePath(project.id, path)}
								onToggleAll={() => toggleProject(project.id)}
							/>
						))}
					</div>
				</div>
			)}

			<div className="flex w-[273px] flex-col gap-2 self-center">
				{nothingToAdopt ? (
					<>
						<SetupButton onClick={() => onFinish()}>Continue</SetupButton>
						<SetupButton variant="link" onClick={onSkip}>
							Skip for now
						</SetupButton>
					</>
				) : (
					<>
						<SetupButton
							onClick={handleImportSelected}
							disabled={
								!allLoaded ||
								totalSelected === 0 ||
								importExternalWorktrees.isPending ||
								isV2Importing ||
								v2NeedsHost
							}
						>
							{isV2Importing && v2Progress
								? `Importing ${v2Progress.current} of ${v2Progress.total}…`
								: importExternalWorktrees.isPending || isV2Importing
									? "Importing…"
									: v2NeedsHost
										? "Connecting…"
										: totalSelected === 0
											? "Select worktrees"
											: `Import ${totalSelected} selected`}
						</SetupButton>
						<SetupButton
							variant="link"
							onClick={onSkip}
							disabled={importExternalWorktrees.isPending || isV2Importing}
						>
							Skip for now
						</SetupButton>
					</>
				)}
			</div>
		</StepShell>
	);
}

interface ProjectWorktreesProps {
	projectId: string;
	projectName: string;
	selectedPaths: Set<string> | undefined;
	onResult: (worktrees: ExternalWorktree[]) => void;
	onTogglePath: (path: string) => void;
	onToggleAll: () => void;
}

function ProjectWorktrees({
	projectId,
	projectName,
	selectedPaths,
	onResult,
	onTogglePath,
	onToggleAll,
}: ProjectWorktreesProps) {
	const { data, isPending, isError, error } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId });

	const onResultRef = useRef(onResult);
	useEffect(() => {
		onResultRef.current = onResult;
	}, [onResult]);

	useEffect(() => {
		if (data) onResultRef.current(data);
		else if (isError) onResultRef.current([]);
	}, [data, isError]);

	if (isPending) {
		return (
			<div className="flex items-center gap-3 px-4 py-3 text-[12px] text-[#a8a5a3]">
				<Spinner className="size-4" />
				<span>Scanning {projectName}…</span>
			</div>
		);
	}

	if (isError) {
		return (
			<div className="bg-red-500/5 px-4 py-3 text-[12px] text-red-400">
				Failed to scan {projectName}:{" "}
				{error instanceof Error ? error.message : "unknown error"}
			</div>
		);
	}

	if (!data || data.length === 0) return null;

	const selectedCount = data.filter((wt) => selectedPaths?.has(wt.path)).length;
	const allSelected = selectedCount === data.length;

	return (
		<div className="space-y-2 px-4 py-3">
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-[12px] font-semibold text-[#eae8e6]">
					{projectName}
				</p>
				<button
					type="button"
					onClick={onToggleAll}
					className="text-[11px] text-[#a8a5a3] transition-colors hover:text-[#eae8e6]"
				>
					{allSelected ? "Deselect all" : "Select all"} ({selectedCount}/
					{data.length})
				</button>
			</div>
			<div className="flex flex-col gap-1">
				{data.map((wt) => {
					const isSelected = selectedPaths?.has(wt.path) ?? false;
					const checkboxId = `worktree-${projectId}-${wt.path}`;
					return (
						<label
							key={wt.path}
							htmlFor={checkboxId}
							className="group flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-white/5"
						>
							<Checkbox
								id={checkboxId}
								checked={isSelected}
								onCheckedChange={() => onTogglePath(wt.path)}
								className="border-[#3a3836] data-[state=checked]:border-[#D97757] data-[state=checked]:bg-[#D97757]"
							/>
							<GoGitBranch className="size-3 shrink-0 text-[#a8a5a3]" />
							<span className="truncate font-mono text-[11px] text-[#eae8e6]">
								{wt.branch}
							</span>
						</label>
					);
				})}
			</div>
		</div>
	);
}
