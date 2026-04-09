import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { useCallback, useMemo } from "react";
import { GoArrowUpRight, GoGitBranch, GoGlobe } from "react-icons/go";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { WorkspaceHostTarget } from "renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../../../DashboardNewWorkspaceDraftContext";
import { useCreateDashboardWorkspace } from "../../../../hooks/useCreateDashboardWorkspace";

interface BranchesGroupProps {
	projectId: string | null;
	localProjectId: string | null;
	hostTarget: WorkspaceHostTarget;
}

export function BranchesGroup({
	projectId,
	localProjectId,
	hostTarget,
}: BranchesGroupProps) {
	const navigate = useNavigate();
	const collections = useCollections();
	const { createWorkspace } = useCreateDashboardWorkspace();
	const { draft, closeAndResetDraft, runAsyncAction } =
		useDashboardNewWorkspaceDraft();

	const hasLocalProject = !!localProjectId;

	const { data: localData, isLoading: isLocalLoading } =
		electronTrpc.projects.getBranchesLocal.useQuery(
			{ projectId: localProjectId ?? "" },
			{ enabled: hasLocalProject },
		);

	const { data: remoteData } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: localProjectId ?? "" },
		{ enabled: hasLocalProject },
	);

	const data = remoteData ?? localData;

	// Check v2Workspaces for existing workspaces by branch
	const { data: v2WorkspacesData } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.v2Workspaces })
				.where(({ ws }) => eq(ws.projectId, projectId ?? ""))
				.select(({ ws }) => ({ id: ws.id, branch: ws.branch })),
		[collections, projectId],
	);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of v2WorkspacesData ?? []) {
			map.set(w.branch, w.id);
		}
		return map;
	}, [v2WorkspacesData]);

	const defaultBranch = data?.defaultBranch ?? "main";

	const branches = (data?.branches ?? []).sort((a, b) => {
		if (a.name === defaultBranch) return -1;
		if (b.name === defaultBranch) return 1;
		if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	const branchRows = useMemo(() => {
		return branches.map((branch) => ({
			branch,
			existingWorkspaceId: workspaceByBranch.get(branch.name),
		}));
	}, [branches, workspaceByBranch]);

	const debouncedQuery = useDebouncedValue(draft.branchesQuery, 150);

	const branchFuse = useMemo(
		() =>
			new Fuse(branchRows, {
				keys: ["branch.name"],
				threshold: 0.3,
				includeScore: true,
				ignoreLocation: true,
			}),
		[branchRows],
	);

	const visibleBranchRows = useMemo(() => {
		const query = debouncedQuery.trim();
		if (!query) {
			return branchRows.slice(0, 100);
		}
		return branchFuse
			.search(query)
			.slice(0, 100)
			.map((result) => result.item);
	}, [debouncedQuery, branchRows, branchFuse]);

	const handleCreate = useCallback(
		(branchName: string) => {
			if (!projectId) return;
			void runAsyncAction(
				createWorkspace({
					projectId,
					name: branchName,
					branch: branchName,
					hostTarget,
				}),
				{
					loading: "Creating workspace from branch...",
					success: "Workspace created",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to create workspace",
				},
			);
		},
		[createWorkspace, hostTarget, projectId, runAsyncAction],
	);

	const handleOpen = useCallback(
		(workspaceId: string) => {
			closeAndResetDraft();
			navigateToV2Workspace(workspaceId, navigate);
		},
		[closeAndResetDraft, navigate],
	);

	const handleBranchAction = useCallback(
		(branchName: string) => {
			const existingId = workspaceByBranch.get(branchName);
			if (existingId) {
				handleOpen(existingId);
				return;
			}
			handleCreate(branchName);
		},
		[handleCreate, handleOpen, workspaceByBranch],
	);

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view branches.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (!hasLocalProject) {
		return (
			<CommandGroup>
				<CommandEmpty>No local repository linked to this project.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (isLocalLoading) {
		return (
			<CommandGroup>
				<CommandEmpty>Loading branches...</CommandEmpty>
			</CommandGroup>
		);
	}

	return (
		<CommandGroup>
			<CommandEmpty>No branches found.</CommandEmpty>
			{visibleBranchRows.map(({ branch, existingWorkspaceId }) => {
				const buttonLabel = existingWorkspaceId ? "Open" : "Create";
				return (
					<CommandItem
						key={branch.name}
						onSelect={() => handleBranchAction(branch.name)}
						className="group h-12"
					>
						{existingWorkspaceId ? (
							<GoArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
						) : branch.isLocal ? (
							<GoGitBranch className="size-4 shrink-0 text-muted-foreground" />
						) : (
							<GoGlobe className="size-4 shrink-0 text-muted-foreground" />
						)}
						<span className="truncate flex-1">{branch.name}</span>
						<Button
							size="xs"
							className="shrink-0 hidden group-data-[selected=true]:inline-flex"
							onClick={(e) => {
								e.stopPropagation();
								handleBranchAction(branch.name);
							}}
						>
							{buttonLabel} ↵
						</Button>
					</CommandItem>
				);
			})}
		</CommandGroup>
	);
}
