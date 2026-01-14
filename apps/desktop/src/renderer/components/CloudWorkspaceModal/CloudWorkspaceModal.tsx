import type { SelectRepository } from "@superset/db/schema";
import { Button } from "@superset/ui/button";
import {
	Command,
	CommandEmpty,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCloud,
	HiOutlineServer,
} from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useCreateCloudWorkspace } from "renderer/react-query/cloud-workspaces";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	useCloseCloudWorkspaceModal,
	useCloudWorkspaceModalOpen,
	useCloudWorkspaceModalStore,
} from "renderer/stores/cloud-workspace-modal";

export function CloudWorkspaceModal() {
	const isOpen = useCloudWorkspaceModalOpen();
	const closeModal = useCloseCloudWorkspaceModal();
	const preSelectedRepositoryId = useCloudWorkspaceModalStore(
		(state) => state.preSelectedRepositoryId,
	);

	const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
	const [name, setName] = useState("");
	const [branch, setBranch] = useState("");
	const [autoStopMinutes, setAutoStopMinutes] = useState("30");
	const [repoSearchOpen, setRepoSearchOpen] = useState(false);
	const [repoSearch, setRepoSearch] = useState("");
	const [branchSearchOpen, setBranchSearchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");

	// Get repositories from Electric SQL
	const collections = useCollections();
	const { data: repositoriesData } = useLiveQuery((q) =>
		q
			.from({ repositories: collections.repositories })
			.select(({ repositories }) => repositories),
	);
	const repositories = repositoriesData ?? [];

	// Get branches for selected repo via desktop trpc (projects router)
	const { data: branchesData, isLoading: isBranchesLoading } =
		trpc.projects.getBranches.useQuery(
			{ projectId: selectedRepoId ?? "" },
			{ enabled: !!selectedRepoId },
		);

	const createCloudWorkspace = useCreateCloudWorkspace({
		onSuccess: () => {
			handleClose();
		},
	});

	// Find selected repository
	const selectedRepo = useMemo(() => {
		return repositories.find((r: SelectRepository) => r.id === selectedRepoId);
	}, [repositories, selectedRepoId]);

	// Filter repositories by search
	const filteredRepos = useMemo(() => {
		if (!repoSearch) return repositories;
		const searchLower = repoSearch.toLowerCase();
		return repositories.filter(
			(r: SelectRepository) =>
				r.name.toLowerCase().includes(searchLower) ||
				r.repoOwner.toLowerCase().includes(searchLower),
		);
	}, [repositories, repoSearch]);

	// Filter branches by search
	const filteredBranches = useMemo(() => {
		if (!branchesData?.branches) return [];
		if (!branchSearch) return branchesData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchesData.branches.filter((b: { name: string }) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchesData?.branches, branchSearch]);

	// Auto-select repository when modal opens
	useEffect(() => {
		if (isOpen && !selectedRepoId && preSelectedRepositoryId) {
			setSelectedRepoId(preSelectedRepositoryId);
		}
	}, [isOpen, selectedRepoId, preSelectedRepositoryId]);

	// Set default branch when repo changes
	useEffect(() => {
		if (branchesData?.defaultBranch && !branch) {
			setBranch(branchesData.defaultBranch);
		}
	}, [branchesData?.defaultBranch, branch]);

	// Generate default name from repo and branch
	useEffect(() => {
		if (selectedRepo && branch && !name) {
			const defaultName = `${selectedRepo.name}-${branch}`;
			setName(defaultName);
		}
	}, [selectedRepo, branch, name]);

	const resetForm = () => {
		setSelectedRepoId(null);
		setName("");
		setBranch("");
		setAutoStopMinutes("30");
		setRepoSearch("");
		setBranchSearch("");
	};

	const handleClose = () => {
		closeModal();
		resetForm();
	};

	const handleCreate = async () => {
		if (!selectedRepoId || !name.trim() || !branch) return;

		const repo = repositories.find(
			(r: SelectRepository) => r.id === selectedRepoId,
		);
		if (!repo) return;

		await createCloudWorkspace.mutateAsync({
			organizationId: repo.organizationId,
			repositoryId: selectedRepoId,
			name: name.trim(),
			branch,
			providerType: "freestyle",
			autoStopMinutes: Number.parseInt(autoStopMinutes) || 30,
		});
	};

	const canCreate =
		selectedRepoId && name.trim() && branch && !createCloudWorkspace.isPending;

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<HiOutlineCloud className="h-5 w-5" />
						New Cloud Workspace
					</DialogTitle>
					<DialogDescription>
						Create a cloud workspace to develop on a remote VM.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 pt-4">
					{/* Repository Selection */}
					<div className="space-y-2">
						<Label>Repository</Label>
						<Popover open={repoSearchOpen} onOpenChange={setRepoSearchOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className="w-full justify-between font-normal"
								>
									{selectedRepo ? (
										<span className="flex items-center gap-2 truncate">
											<HiOutlineServer className="h-4 w-4 shrink-0 text-muted-foreground" />
											<span className="truncate">
												{selectedRepo.repoOwner}/{selectedRepo.name}
											</span>
										</span>
									) : (
										<span className="text-muted-foreground">
											Select repository...
										</span>
									)}
									<HiChevronUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className="w-[--radix-popover-trigger-width] p-0"
								align="start"
							>
								<Command shouldFilter={false}>
									<CommandInput
										placeholder="Search repositories..."
										value={repoSearch}
										onValueChange={setRepoSearch}
									/>
									<CommandList className="max-h-[200px]">
										<CommandEmpty>No repositories found</CommandEmpty>
										{filteredRepos.map((repo: SelectRepository) => (
											<CommandItem
												key={repo.id}
												value={repo.id}
												onSelect={() => {
													setSelectedRepoId(repo.id);
													setBranch(""); // Reset branch when repo changes
													setName(""); // Reset name when repo changes
													setRepoSearchOpen(false);
													setRepoSearch("");
												}}
												className="flex items-center justify-between"
											>
												<span className="flex items-center gap-2 truncate">
													<HiOutlineServer className="h-4 w-4 shrink-0 text-muted-foreground" />
													<span className="truncate">
														{repo.repoOwner}/{repo.name}
													</span>
												</span>
												{selectedRepoId === repo.id && (
													<HiCheck className="h-4 w-4 text-primary" />
												)}
											</CommandItem>
										))}
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</div>

					{/* Branch Selection */}
					<div className="space-y-2">
						<Label>Branch</Label>
						<Popover open={branchSearchOpen} onOpenChange={setBranchSearchOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className="w-full justify-between font-normal"
									disabled={!selectedRepoId || isBranchesLoading}
								>
									{branch ? (
										<span className="flex items-center gap-2 truncate">
											<GoGitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
											<span className="truncate font-mono">{branch}</span>
											{branch === branchesData?.defaultBranch && (
												<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
													default
												</span>
											)}
										</span>
									) : (
										<span className="text-muted-foreground">
											{isBranchesLoading
												? "Loading branches..."
												: "Select branch..."}
										</span>
									)}
									<HiChevronUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className="w-[--radix-popover-trigger-width] p-0"
								align="start"
							>
								<Command shouldFilter={false}>
									<CommandInput
										placeholder="Search branches..."
										value={branchSearch}
										onValueChange={setBranchSearch}
									/>
									<CommandList className="max-h-[200px]">
										<CommandEmpty>No branches found</CommandEmpty>
										{filteredBranches.map((b: { name: string }) => (
											<CommandItem
												key={b.name}
												value={b.name}
												onSelect={() => {
													setBranch(b.name);
													setBranchSearchOpen(false);
													setBranchSearch("");
												}}
												className="flex items-center justify-between"
											>
												<span className="flex items-center gap-2 truncate">
													<GoGitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
													<span className="truncate font-mono">{b.name}</span>
													{b.name === branchesData?.defaultBranch && (
														<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
															default
														</span>
													)}
												</span>
												{branch === b.name && (
													<HiCheck className="h-4 w-4 text-primary" />
												)}
											</CommandItem>
										))}
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</div>

					{/* Workspace Name */}
					<div className="space-y-2">
						<Label htmlFor="name">Workspace Name</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="my-cloud-workspace"
						/>
					</div>

					{/* Auto-Stop Timer */}
					<div className="space-y-2">
						<Label>Auto-stop after inactivity</Label>
						<Select value={autoStopMinutes} onValueChange={setAutoStopMinutes}>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="15">15 minutes</SelectItem>
								<SelectItem value="30">30 minutes</SelectItem>
								<SelectItem value="60">1 hour</SelectItem>
								<SelectItem value="120">2 hours</SelectItem>
								<SelectItem value="240">4 hours</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-xs text-muted-foreground">
							Workspace will pause automatically to save resources
						</p>
					</div>

					{/* Create Button */}
					<Button
						className="w-full"
						onClick={handleCreate}
						disabled={!canCreate}
					>
						{createCloudWorkspace.isPending ? (
							<>Creating...</>
						) : (
							<>
								<HiOutlineCloud className="h-4 w-4 mr-2" />
								Create Cloud Workspace
							</>
						)}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
