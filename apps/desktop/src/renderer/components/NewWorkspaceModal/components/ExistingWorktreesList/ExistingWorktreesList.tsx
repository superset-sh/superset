import { toast } from "@superset/ui/sonner";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useCreateFromPr,
	useCreateWorkspace,
	useOpenExternalWorktree,
	useOpenWorktree,
} from "renderer/react-query/workspaces";
import { BranchesSection, PrUrlSection, WorktreesSection } from "./components";

interface ExistingWorktreesListProps {
	projectId: string;
	onOpenSuccess: () => void;
}

export function ExistingWorktreesList({
	projectId,
	onOpenSuccess,
}: ExistingWorktreesListProps) {
	const { data: worktrees = [], isLoading: isWorktreesLoading } =
		electronTrpc.workspaces.getWorktreesByProject.useQuery({ projectId });
	const {
		data: externalWorktrees = [],
		isLoading: isExternalWorktreesLoading,
	} = electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId });
	const { data: branchData, isLoading: isBranchesLoading } =
		electronTrpc.projects.getBranches.useQuery({ projectId });
	const openWorktree = useOpenWorktree();
	const openExternalWorktree = useOpenExternalWorktree();
	const createWorkspace = useCreateWorkspace();
	const createFromPr = useCreateFromPr();

	const [branchOpen, setBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [worktreeOpen, setWorktreeOpen] = useState(false);
	const [worktreeSearch, setWorktreeSearch] = useState("");
	const [prUrl, setPrUrl] = useState("");

	const closedWorktrees = worktrees
		.filter((wt) => !wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);
	const openWorktrees = worktrees
		.filter((wt) => wt.hasActiveWorkspace)
		.sort((a, b) => b.createdAt - a.createdAt);

	const branchesWithoutWorktrees = useMemo(() => {
		if (!branchData?.branches) return [];
		const worktreeBranches = new Set(worktrees.map((wt) => wt.branch));
		const externalWorktreeBranches = new Set(
			externalWorktrees.map((wt) => wt.branch),
		);
		return branchData.branches.filter(
			(branch) =>
				!worktreeBranches.has(branch.name) &&
				!externalWorktreeBranches.has(branch.name),
		);
	}, [branchData?.branches, worktrees, externalWorktrees]);

	const filteredBranches = useMemo(() => {
		if (!branchSearch) return branchesWithoutWorktrees;
		const searchLower = branchSearch.toLowerCase();
		return branchesWithoutWorktrees.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchesWithoutWorktrees, branchSearch]);

	const handleOpenWorktree = async (worktreeId: string, branch: string) => {
		setWorktreeOpen(false);
		setWorktreeSearch("");
		toast.promise(openWorktree.mutateAsync({ worktreeId }), {
			loading: "Opening workspace...",
			success: () => {
				onOpenSuccess();
				return `Opened ${branch}`;
			},
			error: (err) =>
				err instanceof Error ? err.message : "Failed to open workspace",
		});
	};

	const handleCreateFromBranch = async (branchName: string) => {
		setBranchOpen(false);
		setBranchSearch("");

		try {
			const result = await createWorkspace.mutateAsync({
				projectId,
				branchName,
				useExistingBranch: true,
			});

			onOpenSuccess();

			if (result.isInitializing) {
				toast.success("Workspace created", {
					description: "Setting up in the background...",
				});
			} else {
				toast.success("Workspace created");
			}
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to create workspace",
			);
		}
	};

	const handleCreateFromPr = async () => {
		if (!prUrl.trim()) return;

		try {
			const result = await createFromPr.mutateAsync({
				projectId,
				prUrl: prUrl.trim(),
			});

			onOpenSuccess();
			setPrUrl("");

			if (result.wasExisting) {
				toast.success(`Reopened PR #${result.prNumber}`, {
					description: result.prTitle,
				});
			} else {
				toast.success(`Opened PR #${result.prNumber}`, {
					description: result.prTitle,
				});
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to open PR");
		}
	};

	const handleOpenExternalWorktree = async (path: string, branch: string) => {
		setWorktreeOpen(false);
		setWorktreeSearch("");
		toast.promise(
			openExternalWorktree.mutateAsync({
				projectId,
				worktreePath: path,
				branch,
			}),
			{
				loading: "Opening workspace...",
				success: () => {
					onOpenSuccess();
					return `Opened ${branch}`;
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to open workspace",
			},
		);
	};

	const isLoading =
		isWorktreesLoading || isExternalWorktreesLoading || isBranchesLoading;
	const isPending =
		openWorktree.isPending ||
		openExternalWorktree.isPending ||
		createWorkspace.isPending ||
		createFromPr.isPending;

	if (isLoading) {
		return (
			<div className="py-6 text-center text-xs text-muted-foreground">
				Loading...
			</div>
		);
	}

	const hasWorktrees =
		closedWorktrees.length > 0 ||
		openWorktrees.length > 0 ||
		externalWorktrees.length > 0;
	const hasBranches = branchesWithoutWorktrees.length > 0;

	return (
		<div className="space-y-3 max-h-[350px] overflow-y-auto">
			<PrUrlSection
				prUrl={prUrl}
				onPrUrlChange={setPrUrl}
				onSubmit={handleCreateFromPr}
				isPending={createFromPr.isPending}
			/>

			{hasBranches && (
				<BranchesSection
					branches={filteredBranches}
					defaultBranch={branchData?.defaultBranch}
					searchValue={branchSearch}
					onSearchChange={setBranchSearch}
					isOpen={branchOpen}
					onOpenChange={setBranchOpen}
					onSelectBranch={handleCreateFromBranch}
					disabled={isPending}
				/>
			)}

			{hasWorktrees && (
				<WorktreesSection
					closedWorktrees={closedWorktrees}
					openWorktrees={openWorktrees}
					externalWorktrees={externalWorktrees}
					searchValue={worktreeSearch}
					onSearchChange={setWorktreeSearch}
					isOpen={worktreeOpen}
					onOpenChange={setWorktreeOpen}
					onOpenWorktree={handleOpenWorktree}
					onOpenExternalWorktree={handleOpenExternalWorktree}
					disabled={isPending}
				/>
			)}

			{!hasWorktrees && !hasBranches && (
				<div className="py-4 text-center text-xs text-muted-foreground">
					No existing worktrees or branches.
					<br />
					Paste a PR URL above or create a new branch.
				</div>
			)}
		</div>
	);
}
