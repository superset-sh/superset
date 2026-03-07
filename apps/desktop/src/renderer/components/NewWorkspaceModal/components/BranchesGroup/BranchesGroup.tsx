import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { GoArrowUpRight, GoGitBranch, GoGlobe } from "react-icons/go";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateBranchWorkspace } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useHotkeysStore } from "renderer/stores/hotkeys/store";

interface BranchesGroupProps {
	projectId: string | null;
	onClose: () => void;
}

export function BranchesGroup({ projectId, onClose }: BranchesGroupProps) {
	const platform = useHotkeysStore((state) => state.platform);
	const modKey = platform === "darwin" ? "⌘" : "Ctrl";
	const navigate = useNavigate();
	const createBranchWorkspace = useCreateBranchWorkspace();

	const { data, isLoading } = electronTrpc.projects.getBranches.useQuery(
		{ projectId: projectId ?? "" },
		{ enabled: !!projectId },
	);

	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of allWorkspaces) {
			if (w.projectId === projectId) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [allWorkspaces, projectId]);

	const defaultBranch = data?.defaultBranch ?? "main";

	const branches = (data?.branches ?? [])
		.sort((a, b) => {
			if (a.name === defaultBranch) return -1;
			if (b.name === defaultBranch) return 1;
			if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
			return a.name.localeCompare(b.name);
		})
		.slice(0, 40);

	const handleCreate = useCallback(
		(branchName: string) => {
			if (!projectId) return;
			onClose();
			toast.promise(
				createBranchWorkspace.mutateAsync({
					projectId,
					branch: branchName,
				}),
				{
					loading: "Creating workspace from branch...",
					success: "Workspace created",
					error: (err) =>
						err instanceof Error ? err.message : "Failed to create workspace",
				},
			);
		},
		[projectId, onClose, createBranchWorkspace],
	);

	const handleOpen = useCallback(
		(workspaceId: string) => {
			onClose();
			navigateToWorkspace(workspaceId, navigate);
		},
		[onClose, navigate],
	);

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view branches.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (isLoading) {
		return (
			<CommandGroup>
				<CommandEmpty>Loading branches...</CommandEmpty>
			</CommandGroup>
		);
	}

	return (
		<CommandGroup>
			<CommandEmpty>No branches found.</CommandEmpty>
			{branches.map((branch) => {
				const existingWorkspaceId = workspaceByBranch.get(branch.name);
				return (
					<CommandItem
						key={branch.name}
						value={branch.name}
						onSelect={() => {
							if (existingWorkspaceId) {
								handleOpen(existingWorkspaceId);
							} else {
								handleCreate(branch.name);
							}
						}}
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
						{existingWorkspaceId ? (
							<span className="shrink-0 hidden group-data-[selected=true]:inline-flex items-center gap-1.5">
								<Button
									size="xs"
									variant="outline"
									onClick={(e) => {
										e.stopPropagation();
										handleOpen(existingWorkspaceId);
									}}
								>
									Open ↵
								</Button>
								<Button
									size="xs"
									onClick={(e) => {
										e.stopPropagation();
										handleCreate(branch.name);
									}}
								>
									Duplicate branch {modKey}↵
								</Button>
							</span>
						) : (
							<Button
								size="xs"
								className="shrink-0 hidden group-data-[selected=true]:inline-flex"
								onClick={(e) => {
									e.stopPropagation();
									handleCreate(branch.name);
								}}
							>
								Create ↵
							</Button>
						)}
					</CommandItem>
				);
			})}
		</CommandGroup>
	);
}
