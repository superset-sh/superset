import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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

export function ImportWorkspacesPage({
	organizationId,
	activeHostUrl,
}: ImportWorkspacesPageProps) {
	const queryClient = useQueryClient();
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
		const v2ByPath = new Map<string, string>();
		for (const v2 of hostProjectListQuery.data ?? []) {
			v2ByPath.set(v2.repoPath, v2.id);
		}
		const map = new Map<string, string>();
		for (const v1 of projectsQuery.data ?? []) {
			const v2Id = v2ByPath.get(v1.mainRepoPath);
			if (v2Id) map.set(v1.id, v2Id);
		}
		return map;
	}, [hostProjectListQuery.data, projectsQuery.data]);

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
		visibleWorkspaces.push({ workspace, v2ProjectId, alreadyImported });
	}

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
		>
			{Array.from(grouped.entries()).map(([projectV1Id, group]) => (
				<div key={projectV1Id} className="mb-2 flex min-w-0 flex-col">
					<div className="px-3 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
						{group.projectName}
					</div>
					{group.items.map(({ workspace, v2ProjectId, alreadyImported }) => (
						<WorkspaceRow
							key={workspace.id}
							workspace={workspace}
							worktreePath={
								workspace.worktreeId
									? worktreesById.get(workspace.worktreeId)?.path
									: undefined
							}
							baseBranch={
								workspace.worktreeId
									? (worktreesById.get(workspace.worktreeId)?.baseBranch ??
										null)
									: null
							}
							v2ProjectId={v2ProjectId}
							alreadyImported={alreadyImported}
							organizationId={organizationId}
							activeHostUrl={activeHostUrl}
						/>
					))}
				</div>
			))}
		</ImportPageShell>
	);
}

interface WorkspaceRowProps {
	workspace: {
		id: string;
		name: string;
		branch: string;
		projectId: string;
	};
	worktreePath: string | undefined;
	baseBranch: string | null;
	v2ProjectId: string;
	alreadyImported: boolean;
	organizationId: string;
	activeHostUrl: string;
}

function WorkspaceRow({
	workspace,
	worktreePath,
	baseBranch,
	v2ProjectId,
	alreadyImported,
	organizationId,
	activeHostUrl,
}: WorkspaceRowProps) {
	const queryClient = useQueryClient();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const [running, setRunning] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [adoptedV2Id, setAdoptedV2Id] = useState<string | null>(null);

	const isImported = alreadyImported || !!adoptedV2Id;

	const runImport = async () => {
		setRunning(true);
		setErrorMessage(null);
		try {
			const client = getHostServiceClientByUrl(activeHostUrl);
			const adoptArgs = {
				projectId: v2ProjectId,
				workspaceName: workspace.name,
				branch: workspace.branch,
				baseBranch: baseBranch ?? undefined,
				existingWorkspaceId: adoptedV2Id ?? undefined,
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
			setAdoptedV2Id(result.workspace.id);
			await queryClient.invalidateQueries({
				queryKey: WORKSPACE_CLOUD_LIST_KEY,
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setErrorMessage(message);
			console.error("[v1-import] workspace adopt failed", {
				v1WorkspaceId: workspace.id,
				v2ProjectId,
				branch: workspace.branch,
				organizationId,
				err,
			});
		} finally {
			setRunning(false);
		}
	};

	const action: RowAction = (() => {
		if (running) return { kind: "running" };
		if (isImported) return { kind: "imported" };
		if (errorMessage) {
			return { kind: "error", message: errorMessage, onRetry: runImport };
		}
		return { kind: "ready", label: "Adopt", onClick: runImport };
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
