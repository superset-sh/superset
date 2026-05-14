import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { LuLayoutGrid } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { ImportPageShell } from "../components/ImportPageShell";
import { ImportRow, type RowAction } from "../components/ImportRow";

interface ImportWorkspacesPageProps {
	organizationId: string;
	activeHostUrl: string;
}

const WORKTREE_LIST_KEY_PREFIX = ["v1-import", "projectWorktrees"] as const;
const WORKSPACE_CLOUD_LIST_KEY = ["v1-import", "workspaceCloudList"] as const;
const HOST_PROJECT_LIST_KEY_PREFIX = ["v1-import", "hostProjectList"] as const;

function trpcCode(err: unknown): string | null {
	if (typeof err !== "object" || err === null) return null;
	const data = (err as { data?: unknown }).data;
	if (typeof data !== "object" || data === null) return null;
	const code = (data as { code?: unknown }).code;
	return typeof code === "string" ? code : null;
}

type AdoptStatus =
	| { kind: "idle" }
	| { kind: "running" }
	| { kind: "imported" }
	| { kind: "error"; message: string };

const IDLE: AdoptStatus = { kind: "idle" };

export function ImportWorkspacesPage({
	organizationId,
	activeHostUrl,
}: ImportWorkspacesPageProps) {
	const queryClient = useQueryClient();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const projectsQuery = electronTrpc.migration.readV1Projects.useQuery();
	const workspacesQuery = electronTrpc.migration.readV1Workspaces.useQuery();
	const worktreesQuery = electronTrpc.migration.readV1Worktrees.useQuery();

	const hostProjectListQuery = useQuery({
		queryKey: [...HOST_PROJECT_LIST_KEY_PREFIX, activeHostUrl],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.project.list.query();
		},
		retry: false,
	});

	const cloudWorkspacesQuery = useQuery({
		queryKey: [...WORKSPACE_CLOUD_LIST_KEY, organizationId, activeHostUrl],
		queryFn: async () => {
			const client = getHostServiceClientByUrl(activeHostUrl);
			return client.workspace.cloudList.query();
		},
		retry: false,
	});

	const v2ProjectIdByV1Id = useMemo(() => {
		const projectIdsInCloud = new Set(
			(cloudWorkspacesQuery.data ?? []).map((w) => w.projectId),
		);
		const v2ByPath = new Map<string, string>();
		for (const v2 of hostProjectListQuery.data ?? []) {
			const existing = v2ByPath.get(v2.repoPath);
			if (!existing) {
				v2ByPath.set(v2.repoPath, v2.id);
				continue;
			}
			if (projectIdsInCloud.has(v2.id) && !projectIdsInCloud.has(existing)) {
				v2ByPath.set(v2.repoPath, v2.id);
			}
		}
		const map = new Map<string, string>();
		for (const v1 of projectsQuery.data ?? []) {
			const v2Id = v2ByPath.get(v1.mainRepoPath);
			if (v2Id) map.set(v1.id, v2Id);
		}
		return map;
	}, [
		hostProjectListQuery.data,
		projectsQuery.data,
		cloudWorkspacesQuery.data,
	]);

	const cloudWorkspaceKeys = useMemo(() => {
		const set = new Set<string>();
		for (const w of cloudWorkspacesQuery.data ?? []) {
			set.add(`${w.projectId}\0${w.branch}`);
		}
		return set;
	}, [cloudWorkspacesQuery.data]);

	const importedV2ProjectIds = Array.from(new Set(v2ProjectIdByV1Id.values()));

	const worktreeListQueries = useQueries({
		queries: importedV2ProjectIds.map((v2ProjectId) => ({
			queryKey: [
				...WORKTREE_LIST_KEY_PREFIX,
				v2ProjectId,
				activeHostUrl,
			] as const,
			queryFn: async () => {
				const client = getHostServiceClientByUrl(activeHostUrl);
				const result =
					await client.workspaceCreation.listProjectWorktrees.query({
						projectId: v2ProjectId,
					});
				return result.worktrees;
			},
			retry: false,
		})),
	});

	const validBranchesByV2ProjectId = new Map<string, Set<string>>();
	importedV2ProjectIds.forEach((v2ProjectId, index) => {
		const data = worktreeListQueries[index]?.data;
		if (!data) return;
		validBranchesByV2ProjectId.set(
			v2ProjectId,
			new Set(data.map((w) => w.branch)),
		);
	});

	const isLoading =
		projectsQuery.isPending ||
		workspacesQuery.isPending ||
		worktreesQuery.isPending ||
		hostProjectListQuery.isPending ||
		cloudWorkspacesQuery.isPending ||
		worktreeListQueries.some((q) => q.isPending);

	const [isRefreshing, setIsRefreshing] = useState(false);
	const refresh = async () => {
		setIsRefreshing(true);
		try {
			await Promise.all([
				projectsQuery.refetch(),
				workspacesQuery.refetch(),
				worktreesQuery.refetch(),
				hostProjectListQuery.refetch(),
				cloudWorkspacesQuery.refetch(),
				queryClient.invalidateQueries({
					queryKey: WORKTREE_LIST_KEY_PREFIX,
				}),
			]);
		} finally {
			setIsRefreshing(false);
		}
	};

	const projectsById = new Map(
		(projectsQuery.data ?? []).map((p) => [p.id, p]),
	);
	const worktreesById = new Map(
		(worktreesQuery.data ?? []).map((w) => [w.id, w]),
	);
	const allWorkspaces = workspacesQuery.data ?? [];

	type VisibleWorkspace = {
		workspace: (typeof allWorkspaces)[number];
		v2ProjectId: string;
		alreadyImported: boolean;
		worktreePath: string | undefined;
		baseBranch: string | null;
	};
	const visibleWorkspaces: VisibleWorkspace[] = [];
	for (const workspace of allWorkspaces) {
		const v2ProjectId = v2ProjectIdByV1Id.get(workspace.projectId);
		if (!v2ProjectId) continue;

		const alreadyImported = cloudWorkspaceKeys.has(
			`${v2ProjectId}\0${workspace.branch}`,
		);
		if (!alreadyImported) {
			const validBranches = validBranchesByV2ProjectId.get(v2ProjectId);
			if (validBranches !== undefined && !validBranches.has(workspace.branch)) {
				continue;
			}
		}
		const worktree = workspace.worktreeId
			? worktreesById.get(workspace.worktreeId)
			: undefined;
		visibleWorkspaces.push({
			workspace,
			v2ProjectId,
			alreadyImported,
			worktreePath: worktree?.path,
			baseBranch: worktree?.baseBranch ?? null,
		});
	}

	const [adoptStates, setAdoptStates] = useState<Map<string, AdoptStatus>>(
		() => new Map(),
	);
	const adoptStatesRef = useRef(adoptStates);
	adoptStatesRef.current = adoptStates;

	const updateAdoptStatus = useCallback(
		(workspaceId: string, status: AdoptStatus) => {
			setAdoptStates((prev) => {
				const next = new Map(prev);
				if (status.kind === "idle") {
					next.delete(workspaceId);
				} else {
					next.set(workspaceId, status);
				}
				return next;
			});
		},
		[],
	);

	const adoptWorkspace = useCallback(
		async (entry: VisibleWorkspace) => {
			const { workspace, v2ProjectId, worktreePath, baseBranch } = entry;
			updateAdoptStatus(workspace.id, { kind: "running" });
			try {
				const client = getHostServiceClientByUrl(activeHostUrl);
				const adoptArgs = {
					projectId: v2ProjectId,
					workspaceName: workspace.name,
					branch: workspace.branch,
					baseBranch: baseBranch ?? undefined,
				};
				let result: Awaited<
					ReturnType<typeof client.workspaceCreation.adopt.mutate>
				>;
				try {
					result = await client.workspaceCreation.adopt.mutate({
						...adoptArgs,
						worktreePath,
					});
				} catch (err) {
					if (worktreePath && trpcCode(err) === "NOT_FOUND") {
						result = await client.workspaceCreation.adopt.mutate(adoptArgs);
					} else {
						throw err;
					}
				}

				ensureWorkspaceInSidebar(result.workspace.id, v2ProjectId);
				updateAdoptStatus(workspace.id, { kind: "imported" });
				await queryClient.invalidateQueries({
					queryKey: WORKSPACE_CLOUD_LIST_KEY,
				});
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				updateAdoptStatus(workspace.id, { kind: "error", message });
				console.error("[v1-import] workspace adopt failed", {
					v1WorkspaceId: workspace.id,
					v2ProjectId,
					branch: workspace.branch,
					organizationId,
					err,
				});
			}
		},
		[
			activeHostUrl,
			ensureWorkspaceInSidebar,
			organizationId,
			queryClient,
			updateAdoptStatus,
		],
	);

	const [adoptAllProgress, setAdoptAllProgress] = useState<{
		current: number;
		total: number;
	} | null>(null);

	const pendingEntries = visibleWorkspaces.filter((entry) => {
		if (entry.alreadyImported) return false;
		const status = adoptStates.get(entry.workspace.id) ?? IDLE;
		return status.kind === "idle" || status.kind === "error";
	});

	const visibleWorkspacesRef = useRef(visibleWorkspaces);
	visibleWorkspacesRef.current = visibleWorkspaces;

	const adoptAll = useCallback(async () => {
		const queue = visibleWorkspacesRef.current.filter((entry) => {
			if (entry.alreadyImported) return false;
			const status = adoptStatesRef.current.get(entry.workspace.id) ?? IDLE;
			return status.kind === "idle" || status.kind === "error";
		});
		if (queue.length === 0) return;
		try {
			for (let i = 0; i < queue.length; i++) {
				const entry = queue[i];
				if (!entry) continue;
				const current = adoptStatesRef.current.get(entry.workspace.id) ?? IDLE;
				if (current.kind === "running" || current.kind === "imported") {
					continue;
				}
				setAdoptAllProgress({ current: i, total: queue.length });
				await adoptWorkspace(entry);
			}
		} finally {
			setAdoptAllProgress(null);
		}
	}, [adoptWorkspace]);

	const isAdoptingAll = adoptAllProgress !== null;
	const showAdoptAll = pendingEntries.length > 0 || isAdoptingAll;

	const headerAction = showAdoptAll ? (
		<Button
			type="button"
			size="sm"
			variant="default"
			onClick={() => {
				void adoptAll();
			}}
			disabled={isAdoptingAll || pendingEntries.length === 0}
			className="h-7 shrink-0 gap-1.5 px-2.5 text-[12px] font-medium tabular-nums"
		>
			{adoptAllProgress && <Spinner className="size-3" />}
			{adoptAllProgress
				? `Adopting ${adoptAllProgress.current + 1}/${adoptAllProgress.total}`
				: `Adopt all · ${pendingEntries.length}`}
		</Button>
	) : null;

	const grouped = new Map<
		string,
		{
			projectName: string;
			items: VisibleWorkspace[];
		}
	>();
	for (const entry of visibleWorkspaces) {
		const project = projectsById.get(entry.workspace.projectId);
		if (!project) continue;
		const bucket = grouped.get(entry.workspace.projectId) ?? {
			projectName: project.name,
			items: [],
		};
		bucket.items.push(entry);
		grouped.set(entry.workspace.projectId, bucket);
	}

	return (
		<ImportPageShell
			title="Bring over your workspaces"
			description="Adopt v1 workspaces under their imported v2 project."
			isLoading={isLoading}
			itemCount={visibleWorkspaces.length}
			emptyMessage={
				importedV2ProjectIds.length === 0
					? "Import a project on the Projects tab first to bring over its workspaces."
					: "No v1 workspaces left to import."
			}
			onRefresh={refresh}
			isRefreshing={isRefreshing}
			headerAction={headerAction}
		>
			{Array.from(grouped.entries()).map(([projectV1Id, group]) => (
				<div key={projectV1Id} className="mb-1.5 flex min-w-0 flex-col">
					<div
						className="truncate px-2.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70"
						title={group.projectName}
					>
						{group.projectName}
					</div>
					{group.items.map((entry) => (
						<WorkspaceRow
							key={entry.workspace.id}
							entry={entry}
							status={adoptStates.get(entry.workspace.id) ?? IDLE}
							disabled={isAdoptingAll}
							onAdopt={() => {
								void adoptWorkspace(entry);
							}}
						/>
					))}
				</div>
			))}
		</ImportPageShell>
	);
}

interface WorkspaceRowProps {
	entry: {
		workspace: { id: string; name: string; branch: string };
		alreadyImported: boolean;
	};
	status: AdoptStatus;
	disabled: boolean;
	onAdopt: () => void;
}

function WorkspaceRow({ entry, status, disabled, onAdopt }: WorkspaceRowProps) {
	const { workspace, alreadyImported } = entry;

	const action: RowAction = (() => {
		if (status.kind === "running") {
			return { kind: "running", label: "Adopting…" };
		}
		if (alreadyImported || status.kind === "imported") {
			return { kind: "imported" };
		}
		if (status.kind === "error") {
			return disabled
				? { kind: "running", label: "Queued" }
				: { kind: "error", message: status.message, onRetry: onAdopt };
		}
		return {
			kind: "ready",
			label: "Adopt",
			onClick: onAdopt,
			disabled,
		};
	})();

	return (
		<ImportRow
			icon={<LuLayoutGrid className="size-3.5" strokeWidth={2} />}
			primary={workspace.name}
			secondary={workspace.branch}
			action={action}
		/>
	);
}
