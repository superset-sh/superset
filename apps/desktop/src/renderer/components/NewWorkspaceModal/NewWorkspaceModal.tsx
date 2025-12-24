import { Button } from "@superset/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@superset/ui/collapsible";
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
	DialogHeader,
	DialogTitle,
} from "@superset/ui/dialog";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { toast } from "@superset/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronDown,
	HiChevronUpDown,
	HiPlus,
} from "react-icons/hi2";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { trpc } from "renderer/lib/trpc";
import { useOpenNew } from "renderer/react-query/projects";
import {
	useCreateBranchWorkspace,
	useCreateWorkspace,
} from "renderer/react-query/workspaces";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
} from "renderer/stores/new-workspace-modal";
import { ExistingWorktreesList } from "./components/ExistingWorktreesList";

function generateBranchFromTitle(title: string): string {
	if (!title.trim()) return "";

	return title
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);
}

type Mode = "existing" | "new";

export function NewWorkspaceModal() {
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
		null,
	);
	const [title, setTitle] = useState("");
	const [branchName, setBranchName] = useState("");
	const [branchNameEdited, setBranchNameEdited] = useState(false);
	const [mode, setMode] = useState<Mode>("new");
	const [baseBranch, setBaseBranch] = useState<string | null>(null);
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [showAdvanced, setShowAdvanced] = useState(false);
	const titleInputRef = useRef<HTMLInputElement>(null);

	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: recentProjects = [] } = trpc.projects.getRecents.useQuery();
	const {
		data: branchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = trpc.projects.getBranches.useQuery(
		{ projectId: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const createWorkspace = useCreateWorkspace();
	const createBranchWorkspace = useCreateBranchWorkspace();
	const openNew = useOpenNew();

	const currentProjectId = activeWorkspace?.projectId;

	// Filter branches based on search
	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	// Auto-select current project when modal opens
	useEffect(() => {
		if (isOpen && currentProjectId && !selectedProjectId) {
			setSelectedProjectId(currentProjectId);
		}
	}, [isOpen, currentProjectId, selectedProjectId]);

	// Effective base branch - use explicit selection or fall back to default
	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? null;

	// Reset base branch when project changes
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when project changes
	useEffect(() => {
		setBaseBranch(null);
	}, [selectedProjectId]);

	// Auto-generate branch name from title (unless manually edited)
	useEffect(() => {
		if (!branchNameEdited) {
			setBranchName(generateBranchFromTitle(title));
		}
	}, [title, branchNameEdited]);

	const resetForm = () => {
		setSelectedProjectId(null);
		setTitle("");
		setBranchName("");
		setBranchNameEdited(false);
		setMode("new");
		setBaseBranch(null);
		setBranchSearch("");
		setShowAdvanced(false);
	};

	// Focus title input when modal opens and project is selected
	useEffect(() => {
		if (isOpen && selectedProjectId && mode === "new") {
			// Small delay to ensure dialog is fully rendered
			const timer = setTimeout(() => {
				titleInputRef.current?.focus();
			}, 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedProjectId, mode]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (
			e.key === "Enter" &&
			!e.shiftKey &&
			mode === "new" &&
			selectedProjectId
		) {
			e.preventDefault();
			handleCreateWorkspace();
		}
	};

	const handleClose = () => {
		closeModal();
		resetForm();
	};

	const handleBranchNameChange = (value: string) => {
		setBranchName(value);
		setBranchNameEdited(true);
	};

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId) return;

		const workspaceName = title.trim() || undefined;
		const customBranchName = branchName.trim() || undefined;

		toast.promise(
			createWorkspace.mutateAsync({
				projectId: selectedProjectId,
				name: workspaceName,
				branchName: customBranchName,
				baseBranch: effectiveBaseBranch || undefined,
			}),
			{
				loading: "Creating workspace...",
				success: () => {
					handleClose();
					return "Workspace created";
				},
				error: (err) =>
					err instanceof Error ? err.message : "Failed to create workspace",
			},
		);
	};

	const handleOpenNewProject = async () => {
		try {
			const result = await openNew.mutateAsync(undefined);
			if (result.canceled) {
				return;
			}
			if ("error" in result) {
				toast.error("Failed to open project", {
					description: result.error,
				});
				return;
			}
			if ("needsGitInit" in result) {
				toast.error("Selected folder is not a git repository", {
					description:
						"Please use 'Open project' from the start view to initialize git.",
				});
				return;
			}
			// Create a main workspace on the current branch for the new project
			await createBranchWorkspace.mutateAsync({ projectId: result.project.id });
			setSelectedProjectId(result.project.id);
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent
				className="sm:max-w-[380px] gap-0 p-0 overflow-hidden"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle className="text-base">Open Workspace</DialogTitle>
				</DialogHeader>

				<div className="px-4 pb-3">
					<div className="flex items-center gap-2">
						<Select
							value={selectedProjectId ?? ""}
							onValueChange={setSelectedProjectId}
						>
							<SelectTrigger className="flex-1 h-8 text-sm">
								<SelectValue placeholder="Select project" />
							</SelectTrigger>
							<SelectContent>
								{recentProjects.map((project) => (
									<SelectItem key={project.id} value={project.id}>
										{project.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 shrink-0"
									onClick={handleOpenNewProject}
									disabled={openNew.isPending}
								>
									<HiPlus className="h-4 w-4" />
								</Button>
							</TooltipTrigger>
							<TooltipContent side="bottom" sideOffset={4}>
								Add new project
							</TooltipContent>
						</Tooltip>
					</div>
				</div>

				{selectedProjectId && (
					<>
						<div className="px-4 pb-3">
							<div className="flex p-0.5 bg-muted rounded-md">
								<button
									type="button"
									onClick={() => setMode("new")}
									className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
										mode === "new"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									New
								</button>
								<button
									type="button"
									onClick={() => setMode("existing")}
									className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
										mode === "existing"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Existing
								</button>
							</div>
						</div>

						<div className="px-4 pb-4">
							{mode === "new" ? (
								<div className="space-y-3">
									<Input
										ref={titleInputRef}
										id="title"
										className="h-9 text-sm"
										placeholder="Feature name (press Enter to create)"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
									/>

									{title && !showAdvanced && (
										<p className="text-xs text-muted-foreground flex items-center gap-1.5">
											<GoGitBranch className="size-3" />
											<span className="font-mono">
												{branchName || generateBranchFromTitle(title)}
											</span>
											<span className="text-muted-foreground/60">
												from {effectiveBaseBranch}
											</span>
										</p>
									)}

									<Collapsible
										open={showAdvanced}
										onOpenChange={setShowAdvanced}
									>
										<CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
											<HiChevronDown
												className={`size-3 transition-transform ${showAdvanced ? "" : "-rotate-90"}`}
											/>
											Advanced options
										</CollapsibleTrigger>
										<CollapsibleContent className="pt-3 space-y-3">
											<div className="space-y-1.5">
												<label
													htmlFor="branch"
													className="text-xs text-muted-foreground"
												>
													Branch name
												</label>
												<Input
													id="branch"
													className="h-8 text-sm font-mono"
													placeholder={
														title
															? generateBranchFromTitle(title)
															: "auto-generated"
													}
													value={branchName}
													onChange={(e) =>
														handleBranchNameChange(e.target.value)
													}
												/>
											</div>

											<div className="space-y-1.5">
												<span className="text-xs text-muted-foreground">
													Base branch
												</span>
												{isBranchesError ? (
													<div className="flex items-center gap-2 h-8 px-3 rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs">
														Failed to load branches
													</div>
												) : (
													<Popover
														open={baseBranchOpen}
														onOpenChange={setBaseBranchOpen}
													>
														<PopoverTrigger asChild>
															<Button
																variant="outline"
																size="sm"
																className="w-full h-8 justify-between font-normal"
																disabled={isBranchesLoading}
															>
																<span className="flex items-center gap-2 truncate">
																	<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																	<span className="truncate font-mono text-sm">
																		{effectiveBaseBranch || "Select branch..."}
																	</span>
																	{effectiveBaseBranch ===
																		branchData?.defaultBranch && (
																		<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																			default
																		</span>
																	)}
																</span>
																<HiChevronUpDown className="size-4 shrink-0 text-muted-foreground" />
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
																	{filteredBranches.map((branch) => (
																		<CommandItem
																			key={branch.name}
																			value={branch.name}
																			onSelect={() => {
																				setBaseBranch(branch.name);
																				setBaseBranchOpen(false);
																				setBranchSearch("");
																			}}
																			className="flex items-center justify-between"
																		>
																			<span className="flex items-center gap-2 truncate">
																				<GoGitBranch className="size-3.5 shrink-0 text-muted-foreground" />
																				<span className="truncate">
																					{branch.name}
																				</span>
																				{branch.name ===
																					branchData?.defaultBranch && (
																					<span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
																						default
																					</span>
																				)}
																			</span>
																			<span className="flex items-center gap-2 shrink-0">
																				{branch.lastCommitDate > 0 && (
																					<span className="text-xs text-muted-foreground">
																						{formatRelativeTime(
																							branch.lastCommitDate,
																						)}
																					</span>
																				)}
																				{effectiveBaseBranch ===
																					branch.name && (
																					<HiCheck className="size-4 text-primary" />
																				)}
																			</span>
																		</CommandItem>
																	))}
																</CommandList>
															</Command>
														</PopoverContent>
													</Popover>
												)}
											</div>
										</CollapsibleContent>
									</Collapsible>

									<Button
										className="w-full h-8 text-sm"
										onClick={handleCreateWorkspace}
										disabled={createWorkspace.isPending || isBranchesError}
									>
										Create Workspace
									</Button>
								</div>
							) : (
								<ExistingWorktreesList
									projectId={selectedProjectId}
									onOpenSuccess={handleClose}
								/>
							)}
						</div>
					</>
				)}

				{!selectedProjectId && (
					<div className="px-4 pb-4 pt-2">
						<div className="text-center text-sm text-muted-foreground py-8">
							Select a project to get started
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
