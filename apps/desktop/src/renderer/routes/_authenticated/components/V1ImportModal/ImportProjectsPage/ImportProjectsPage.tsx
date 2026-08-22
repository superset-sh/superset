import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import type { QueryClient } from "@tanstack/react-query";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuFolder } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	decideProjectImport,
	expectedRemoteUrlFor,
	extractExistingPath,
	importV1Project,
	isProjectAlreadyImported,
	type ProjectFindByPathResult,
	type ProjectImportDecision,
	type ProjectImportOutcome,
	recordV1MigrationOutcome,
} from "renderer/lib/v1-migration";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";
import {
	IDLE_IMPORT_STATUS as IDLE,
	type ProjectImportStatus,
	planProjectRowAction,
	selectPendingProjects,
} from "./import-plan";

interface ImportProjectsPageProps {
	organizationId: string;
	activeHostUrl: string;
}

const FIND_BY_PATH_KEY_PREFIX = ["v1-import", "findByPath"] as const;
const HOST_PROJECT_LIST_KEY_PREFIX = ["v1-import", "hostProjectList"] as const;

type V1Project = {
	id: string;
	name: string;
	mainRepoPath: string;
	githubOwner: string | null;
	/** v1 accent color: a `#rrggbb` hex or the "default" sentinel. */
	color: string;
	/** v1 "hide the GitHub avatar" flag — carries as the "none" icon. */
	hideImage: boolean | null;
};

export function ImportProjectsPage({
	organizationId,
	activeHostUrl,
}: ImportProjectsPageProps) {
	const queryClient = useQueryClient();
	const finalizeSetup = useFinalizeProjectSetup();
	const projectsQuery = electronTrpc.migration.readV1Projects.useQuery();
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [importAllProgress, setImportAllProgress] = useState<{
		current: number;
		total: number;
	} | null>(null);

	const isLoading = projectsQuery.isPending;
	const isImportingAll = importAllProgress !== null;

	const projects = projectsQuery.data ?? [];

	const [importStates, setImportStates] = useState<
		Map<string, ProjectImportStatus>
	>(() => new Map());
	const importStatesRef = useRef(importStates);
	importStatesRef.current = importStates;

	const updateImportStatus = useCallback(
		(v1ProjectId: string, status: ProjectImportStatus) => {
			setImportStates((prev) => {
				const next = new Map(prev);
				if (status.kind === "idle") next.delete(v1ProjectId);
				else next.set(v1ProjectId, status);
				return next;
			});
		},
		[],
	);

	// Page-level mirrors of the per-row findByPath queries (same keys, so
	// the cache is shared) — they feed the pending count and the Import All
	// queue without reaching into row component state.
	const findByPathQueries = useQueries({
		queries: projects.map((project) => ({
			queryKey: projectFindByPathQueryKey(project, activeHostUrl),
			queryFn: projectFindByPathQueryFn(project, activeHostUrl),
		})),
	});

	const decisions = useMemo(() => {
		const map = new Map<string, ProjectImportDecision | undefined>();
		projects.forEach((project, index) => {
			const data = findByPathQueries[index]?.data;
			map.set(project.id, data ? decideProjectImport(data) : undefined);
		});
		return map;
	}, [projects, findByPathQueries]);

	const pendingProjects = selectPendingProjects(
		projects,
		decisions,
		importStates,
	);

	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				projectsQuery.refetch(),
				queryClient.invalidateQueries({ queryKey: FIND_BY_PATH_KEY_PREFIX }),
			]);
		} finally {
			setIsRefreshing(false);
		}
	};

	const importAll = async () => {
		if (isImportingAll) return;
		const queue = selectPendingProjects(
			projects,
			decisions,
			importStatesRef.current,
		);
		if (queue.length === 0) return;
		setImportAllProgress({ current: 0, total: queue.length });
		try {
			for (let i = 0; i < queue.length; i++) {
				const project = queue[i];
				if (!project) continue;
				const current = importStatesRef.current.get(project.id) ?? IDLE;
				if (current.kind === "running" || current.kind === "imported") {
					continue;
				}
				setImportAllProgress({ current: i, total: queue.length });
				updateImportStatus(project.id, { kind: "running" });
				let findByPathResult: ProjectFindByPathResult;
				try {
					findByPathResult = await fetchProjectFindByPath(
						queryClient,
						project,
						activeHostUrl,
					);
				} catch (err) {
					// Lookup failed (host/cloud outage) — that is a discovery
					// failure, not an import failure. Back to idle so the row's
					// own query-error affordance (Retry = refetch) surfaces;
					// recording an import error here would let Retry start an
					// import with no discovery data and re-create the exact
					// duplicate this fix exists to prevent.
					updateImportStatus(project.id, IDLE);
					console.error("[v1-import] project lookup failed during import all", {
						v1ProjectId: project.id,
						mainRepoPath: project.mainRepoPath,
						organizationId,
						err,
					});
					continue;
				}
				try {
					const decision = decideProjectImport(findByPathResult);
					if (decision.kind === "already-imported") {
						updateImportStatus(project.id, {
							kind: "imported",
							v2ProjectId: decision.v2ProjectId,
						});
						continue;
					}
					if (decision.kind !== "import") {
						// Needs a human (pick / cloud unreachable) — leave idle;
						// the row renders its own pick/error affordance.
						updateImportStatus(project.id, IDLE);
						continue;
					}
					const result = await importProject({
						project,
						organizationId,
						activeHostUrl,
						findByPathResult,
						finalizeSetup,
					});
					if (result.kind === "imported") {
						updateImportStatus(project.id, {
							kind: "imported",
							v2ProjectId: result.v2ProjectId,
						});
						await invalidateProjectImportQueries(queryClient, project);
					} else {
						// needs-relocate requires the row's confirm flow; recording
						// it here surfaces the confirm UI and keeps the project out
						// of the pending count until the user decides.
						updateImportStatus(project.id, {
							kind: "needs-relocate",
							v2ProjectId: result.v2ProjectId,
							message: result.message,
						});
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : String(err);
					updateImportStatus(project.id, { kind: "error", message });
					console.error("[v1-import] project import all failed", {
						v1ProjectId: project.id,
						mainRepoPath: project.mainRepoPath,
						organizationId,
						err,
					});
				}
			}
		} finally {
			setImportAllProgress(null);
		}
	};

	const showImportAll = pendingProjects.length > 0 || isImportingAll;

	const headerAction = showImportAll ? (
		<Button
			type="button"
			size="sm"
			variant="default"
			onClick={() => {
				void importAll();
			}}
			disabled={isImportingAll || isLoading || pendingProjects.length === 0}
			className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium tabular-nums"
		>
			{importAllProgress && <Spinner className="size-3" />}
			{importAllProgress
				? `Importing ${importAllProgress.current + 1}/${importAllProgress.total}`
				: `Import all · ${pendingProjects.length}`}
		</Button>
	) : null;

	return (
		<ImportPageShell
			title="Bring over your projects"
			description="Import each v1 project into v2. Already-imported projects show as Imported."
			isLoading={isLoading}
			itemCount={projects.length}
			emptyMessage="No v1 projects found on this device."
			onRefresh={refresh}
			isRefreshing={isRefreshing}
			headerAction={headerAction}
		>
			{projects.map((project) => (
				<ProjectRow
					key={project.id}
					project={project}
					organizationId={organizationId}
					activeHostUrl={activeHostUrl}
					status={importStates.get(project.id) ?? IDLE}
					onStatusChange={(status) => updateImportStatus(project.id, status)}
					disabled={isImportingAll}
				/>
			))}
		</ImportPageShell>
	);
}

interface ProjectRowProps {
	project: V1Project;
	organizationId: string;
	activeHostUrl: string;
	status: ProjectImportStatus;
	onStatusChange: (status: ProjectImportStatus) => void;
	/** True while Import All runs — row actions must not start
	 * concurrent imports. */
	disabled: boolean;
}

function projectFindByPathQueryKey(project: V1Project, activeHostUrl: string) {
	return [
		...FIND_BY_PATH_KEY_PREFIX,
		project.mainRepoPath,
		expectedRemoteUrlFor(project) ?? "",
		activeHostUrl,
	] as const;
}

function projectFindByPathQueryFn(project: V1Project, activeHostUrl: string) {
	return async () => {
		const client = getHostServiceClientByUrl(activeHostUrl);
		return client.project.findByPath.query({
			repoPath: project.mainRepoPath,
			walkAllRemotes: true,
			expectedRemoteUrl: expectedRemoteUrlFor(project),
		});
	};
}

function fetchProjectFindByPath(
	queryClient: QueryClient,
	project: V1Project,
	activeHostUrl: string,
) {
	return queryClient.fetchQuery({
		queryKey: projectFindByPathQueryKey(project, activeHostUrl),
		queryFn: projectFindByPathQueryFn(project, activeHostUrl),
	});
}

type FinalizeProjectSetup = ReturnType<typeof useFinalizeProjectSetup>;

/** Shared import plus the wizard's UI side effects and ledger record. */
async function importProject({
	project,
	organizationId,
	activeHostUrl,
	findByPathResult,
	finalizeSetup,
	linkToProjectId,
	allowRelocate = false,
}: {
	project: V1Project;
	organizationId: string;
	activeHostUrl: string;
	findByPathResult: ProjectFindByPathResult | undefined;
	finalizeSetup: FinalizeProjectSetup;
	linkToProjectId?: string;
	allowRelocate?: boolean;
}): Promise<ProjectImportOutcome> {
	const result = await importV1Project({
		hostClient: getHostServiceClientByUrl(activeHostUrl),
		project,
		findByPathResult,
		linkToProjectId,
		allowRelocate,
	});
	if (result.kind === "imported") {
		finalizeSetup(activeHostUrl, {
			projectId: result.v2ProjectId,
			repoPath: result.repoPath,
			mainWorkspaceId: result.mainWorkspaceId,
		});
		recordV1MigrationOutcome(organizationId, {
			v1Id: project.id,
			kind: "project",
			status: "success",
			v2Id: result.v2ProjectId,
		});
	}
	return result;
}

function invalidateProjectImportQueries(
	queryClient: QueryClient,
	project: V1Project,
) {
	return Promise.all([
		queryClient.invalidateQueries({
			queryKey: [...FIND_BY_PATH_KEY_PREFIX, project.mainRepoPath],
		}),
		queryClient.invalidateQueries({
			queryKey: HOST_PROJECT_LIST_KEY_PREFIX,
		}),
	]);
}

function ProjectRow({
	project,
	organizationId,
	activeHostUrl,
	status,
	onStatusChange,
	disabled,
}: ProjectRowProps) {
	const queryClient = useQueryClient();
	const finalizeSetup = useFinalizeProjectSetup();

	const findByPathQuery = useQuery({
		queryKey: projectFindByPathQueryKey(project, activeHostUrl),
		queryFn: projectFindByPathQueryFn(project, activeHostUrl),
	});

	const runImport = async (
		linkToProjectId?: string,
		options: { allowRelocate?: boolean } = {},
	) => {
		onStatusChange({ kind: "running" });
		try {
			// Never import blind: a retry after a failed lookup would otherwise
			// skip candidate discovery entirely (undefined data → zero
			// candidates → fresh create instead of linking). fetchQuery dedupes
			// against the row's own query, so this is a no-op when data exists.
			const findByPathResult =
				findByPathQuery.data ??
				(await fetchProjectFindByPath(queryClient, project, activeHostUrl));
			const result = await importProject({
				project,
				organizationId,
				activeHostUrl,
				findByPathResult,
				finalizeSetup,
				linkToProjectId,
				allowRelocate: options.allowRelocate ?? false,
			});

			if (result.kind === "needs-relocate") {
				onStatusChange({
					kind: "needs-relocate",
					v2ProjectId: result.v2ProjectId,
					message: result.message,
				});
				return;
			}

			onStatusChange({ kind: "imported", v2ProjectId: result.v2ProjectId });
			await invalidateProjectImportQueries(queryClient, project);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			onStatusChange({ kind: "error", message });
			console.error("[v1-import] project import failed", {
				v1ProjectId: project.id,
				mainRepoPath: project.mainRepoPath,
				organizationId,
				err,
			});
		}
	};

	const plan = planProjectRowAction({
		status,
		isImportingAll: disabled,
		findByPathPending: findByPathQuery.isPending,
		findByPathErrorMessage: findByPathQuery.isError
			? findByPathQuery.error instanceof Error
				? findByPathQuery.error.message
				: String(findByPathQuery.error)
			: null,
		findByPathData: findByPathQuery.data,
		serverImported: isProjectAlreadyImported(findByPathQuery.data),
	});

	const action: RowAction = (() => {
		switch (plan.kind) {
			case "running":
				return { kind: "running", label: plan.label };
			case "imported":
				return { kind: "imported", label: plan.label };
			case "confirm-relocate": {
				const existingPath = extractExistingPath(plan.message);
				const relocateTo =
					status.kind === "needs-relocate" ? status.v2ProjectId : null;
				return {
					kind: "confirm",
					message: existingPath
						? `Already set up at ${existingPath}. Link to ${project.mainRepoPath} instead?`
						: `Link to ${project.mainRepoPath}?`,
					confirmLabel: "Use this folder",
					cancelLabel: "Cancel",
					disabled: plan.disabled,
					onConfirm: () => {
						if (relocateTo) {
							void runImport(relocateTo, { allowRelocate: true });
						}
					},
					onCancel: () => onStatusChange({ kind: "idle" }),
				};
			}
			case "error":
				return {
					kind: "error",
					message: plan.message,
					// Belt-and-suspenders: import-retry errors render as "Queued"
					// during a batch, so this fires only for query retries there —
					// but guard anyway so no future mapping can start a concurrent
					// import mid-batch.
					onRetry: () => {
						if (disabled) return;
						if (plan.retry === "import") {
							void runImport();
						} else {
							void findByPathQuery.refetch();
						}
					},
				};
			case "pick":
				return {
					kind: "pick",
					label: "Link to…",
					candidates: findByPathQuery.data?.candidates ?? [],
					disabled: plan.disabled,
					onPick: (id) => {
						void runImport(id);
					},
				};
			case "ready":
				return {
					kind: "ready",
					label: plan.label,
					disabled: plan.disabled,
					onClick: () => {
						void runImport();
					},
				};
		}
	})();

	return (
		<ImportRow
			icon={<LuFolder className="size-3.5" strokeWidth={2} />}
			primary={project.name}
			secondary={project.mainRepoPath}
			action={action}
		/>
	);
}
