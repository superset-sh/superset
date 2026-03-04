import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@superset/ui/alert-dialog";
import { Button } from "@superset/ui/button";
import { toast } from "@superset/ui/sonner";
import { Tabs, TabsList, TabsTrigger } from "@superset/ui/tabs";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	useCreateFromPr,
	useCreateWorkspace,
	useImportAllWorktrees,
	useOpenExternalWorktree,
	useOpenWorktree,
} from "renderer/react-query/workspaces";
import { BranchesSection, PrUrlSection, WorktreesSection } from "./components";

interface ExistingWorktreesListProps {
	projectId: string;
	onOpenSuccess: () => void;
	activeTab?: ImportSourceTab;
	onActiveTabChange?: (tab: ImportSourceTab) => void;
	showTabs?: boolean;
}

export type ImportSourceTab = "pull-request" | "branches" | "worktrees";

export function ExistingWorktreesList({
	projectId,
	onOpenSuccess,
	activeTab,
	onActiveTabChange,
	showTabs = true,
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
	const importAllWorktrees = useImportAllWorktrees();

	const [branchOpen, setBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [worktreeOpen, setWorktreeOpen] = useState(false);
	const [worktreeSearch, setWorktreeSearch] = useState("");
	const [prUrl, setPrUrl] = useState("");
	const [internalActiveTab, setInternalActiveTab] =
		useState<ImportSourceTab>("pull-request");
	const selectedTab = activeTab ?? internalActiveTab;
	const setSelectedTab = onActiveTabChange ?? setInternalActiveTab;

	const closedWorktrees = worktrees
		.filter((wt) => !wt.hasActiveWorkspace && wt.existsOnDisk)
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

	const handleImportAll = async () => {
		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			onOpenSuccess();
			toast.success(
				`Imported ${result.imported} workspace${result.imported === 1 ? "" : "s"}`,
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to import worktrees",
			);
		}
	};

	const isLoading =
		isWorktreesLoading || isExternalWorktreesLoading || isBranchesLoading;
	const isPending =
		openWorktree.isPending ||
		openExternalWorktree.isPending ||
		createWorkspace.isPending ||
		createFromPr.isPending ||
		importAllWorktrees.isPending;

	const importableCount = closedWorktrees.length + externalWorktrees.length;

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
			{showTabs && (
				<Tabs
					value={selectedTab}
					onValueChange={(value) => setSelectedTab(value as ImportSourceTab)}
				>
					<TabsList className="h-8 bg-transparent p-0 gap-1">
						<TabsTrigger
							value="pull-request"
							className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
						>
							Pull request
						</TabsTrigger>
						<TabsTrigger
							value="branches"
							className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
						>
							Branches
						</TabsTrigger>
						<TabsTrigger
							value="worktrees"
							className="h-8 rounded-md px-3 data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground"
						>
							Worktrees
						</TabsTrigger>
					</TabsList>
				</Tabs>
			)}

			{selectedTab === "pull-request" && (
				<PrUrlSection
					prUrl={prUrl}
					onPrUrlChange={setPrUrl}
					onSubmit={handleCreateFromPr}
					isPending={createFromPr.isPending}
				/>
			)}

			{selectedTab === "branches" &&
				(hasBranches ? (
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
				) : (
					<div className="py-4 text-center text-xs text-muted-foreground">
						No branches available to import.
					</div>
				))}

			{selectedTab === "worktrees" &&
				(hasWorktrees ? (
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
				) : (
					<div className="py-4 text-center text-xs text-muted-foreground">
						No worktrees available to import.
					</div>
				))}

			{selectedTab === "worktrees" && importableCount > 0 && (
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button
							variant="ghost"
							size="sm"
							className="w-full h-7 text-xs text-muted-foreground"
							disabled={isPending}
						>
							{importAllWorktrees.isPending
								? "Importing..."
								: `Import all external worktrees (${importableCount})`}
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Import all worktrees</AlertDialogTitle>
							<AlertDialogDescription>
								This will import {importableCount} external worktree
								{importableCount === 1 ? "" : "s"} into Superset as workspaces.
								Each worktree on disk will be tracked and appear in your
								sidebar. No files will be modified.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction onClick={handleImportAll}>
								Import all
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			)}

			{selectedTab === "pull-request" && !hasWorktrees && !hasBranches && (
				<div className="py-4 text-center text-xs text-muted-foreground">
					No existing worktrees or branches found.
					<br />
					Use Pull request tab to paste a PR URL.
				</div>
			)}
		</div>
	);
}
