import { toast } from "@superset/ui/sonner";
import { Spinner } from "@superset/ui/spinner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useImportAllWorktrees } from "renderer/react-query/workspaces/useImportAllWorktrees";
import { STEP_ROUTES, useOnboardingStore } from "renderer/stores/onboarding";
import { SetupButton } from "../components/SetupButton";
import { StepHeader, StepShell } from "../components/StepShell";

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
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	const { data: projects, isPending } =
		electronTrpc.projects.getRecents.useQuery();

	useEffect(() => {
		goTo("adopt-worktrees");
	}, [goTo]);

	// After onboarding, prefer the user's last-viewed workspace (or any worktree-
	// type workspace) so they land in the workspace editor with a real pane
	// layout. Route to the v2 workspace view when v2 is enabled. In v2, skip
	// `branch` type workspaces (they're auto-created by ensureMainWorkspace and
	// have no pane layout) and prefer the project page instead so the user can
	// create their first worktree via v2's flow. If no workspaces exist yet,
	// fall back to the project page.
	const navigateAfterFlow = useCallback(
		async (replace: boolean) => {
			try {
				const grouped = await utils.workspaces.getAllGrouped.fetch();
				const allWorkspaces = grouped.flatMap((g) => g.workspaces);
				const lastViewedId = localStorage.getItem("lastViewedWorkspaceId");
				const candidates = isV2CloudEnabled
					? allWorkspaces.filter((w) => w.type === "worktree")
					: allWorkspaces;
				const target =
					candidates.find((w) => w.id === lastViewedId) ?? candidates[0];
				if (target) {
					if (isV2CloudEnabled) {
						navigate({
							to: "/v2-workspace/$workspaceId",
							params: { workspaceId: target.id },
							replace,
						});
					} else {
						navigate({
							to: "/workspace/$workspaceId",
							params: { workspaceId: target.id },
							replace,
						});
					}
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

	const finishFlow = useCallback(() => {
		const startedAt = useOnboardingStore.getState().startedAt;
		track("onboarding_finished", {
			outcome: "completed",
			duration_ms: startedAt ? Date.now() - startedAt : null,
		});
		markComplete("adopt-worktrees");
		setManualWalkthrough(false);
		void navigateAfterFlow(true);
	}, [markComplete, setManualWalkthrough, navigateAfterFlow]);

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
		// No projects → nothing to adopt. Skip this step entirely (even in walkthrough)
		// since the page has no actionable content.
		return <AutoAdvance onAdvance={finishFlow} />;
	}

	return (
		<AdoptWorktreesContent
			projects={projects.map((p) => ({ id: p.id, name: p.name }))}
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

interface AdoptWorktreesContentProps {
	projects: { id: string; name: string }[];
	onSkip: () => void;
	onFinish: () => void;
	manualWalkthrough: boolean;
}

function AdoptWorktreesContent({
	projects,
	onSkip,
	onFinish,
	manualWalkthrough,
}: AdoptWorktreesContentProps) {
	const importAllWorktrees = useImportAllWorktrees();
	const [results, setResults] = useState<
		Record<string, { worktrees: ExternalWorktree[]; loaded: boolean }>
	>({});

	const allLoaded = projects.every((p) => results[p.id]?.loaded);
	const total = useMemo(
		() =>
			Object.values(results).reduce(
				(acc, r) => acc + (r.loaded ? r.worktrees.length : 0),
				0,
			),
		[results],
	);

	useEffect(() => {
		// In walkthrough mode the user wants to see every step, including a
		// "nothing to adopt" confirmation. Otherwise auto-advance when empty.
		if (allLoaded && total === 0 && !manualWalkthrough) onFinish();
	}, [allLoaded, total, manualWalkthrough, onFinish]);

	const handleImportAll = async () => {
		let totalImported = 0;
		for (const project of projects) {
			const projectResult = results[project.id];
			if (!projectResult || projectResult.worktrees.length === 0) continue;
			try {
				const result = await importAllWorktrees.mutateAsync({
					projectId: project.id,
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
		if (totalImported > 0) {
			toast.success(
				`Imported ${totalImported} workspace${totalImported === 1 ? "" : "s"}`,
			);
		}
		onFinish();
	};

	const nothingToAdopt = allLoaded && total === 0;

	return (
		<StepShell backTo={STEP_ROUTES.project} maxWidth="lg">
			<StepHeader
				title="Adopt existing worktrees"
				subtitle={
					!allLoaded
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
								onResult={(worktrees) => {
									setResults((prev) => ({
										...prev,
										[project.id]: { worktrees, loaded: true },
									}));
								}}
							/>
						))}
					</div>
				</div>
			)}

			<div className="flex w-[273px] flex-col gap-2 self-center">
				{nothingToAdopt ? (
					<SetupButton onClick={onFinish}>Continue</SetupButton>
				) : (
					<>
						<SetupButton
							onClick={handleImportAll}
							disabled={!allLoaded || importAllWorktrees.isPending}
						>
							{importAllWorktrees.isPending ? "Importing…" : "Import all"}
						</SetupButton>
						<SetupButton
							variant="link"
							onClick={onSkip}
							disabled={importAllWorktrees.isPending}
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
	onResult: (worktrees: ExternalWorktree[]) => void;
}

function ProjectWorktrees({
	projectId,
	projectName,
	onResult,
}: ProjectWorktreesProps) {
	const { data, isPending, isError, error } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId });

	// Keep the latest callback in a ref so we don't refire the effect when the
	// parent passes a fresh inline closure each render.
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

	return (
		<div className="space-y-2 px-4 py-3">
			<div className="flex items-baseline justify-between gap-3">
				<p className="text-[12px] font-semibold text-[#eae8e6]">
					{projectName}
				</p>
				<p className="text-[11px] text-[#a8a5a3]">
					{data.length} worktree{data.length === 1 ? "" : "s"}
				</p>
			</div>
			<div className="flex flex-wrap gap-1.5">
				{data.map((wt) => (
					<span
						key={wt.path}
						className="inline-flex items-center gap-1 rounded-md bg-[#151110] px-2 py-0.5 font-mono text-[11px] text-[#a8a5a3]"
					>
						<GoGitBranch className="size-3 shrink-0" />
						<span className="max-w-[180px] truncate">{wt.branch}</span>
					</span>
				))}
			</div>
		</div>
	);
}
