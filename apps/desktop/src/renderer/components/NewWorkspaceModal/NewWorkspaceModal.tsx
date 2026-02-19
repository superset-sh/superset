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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { Input } from "@superset/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { toast } from "@superset/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronDown,
	HiChevronUpDown,
	HiOutlinePencil,
} from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useOpenProject } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { resolveBranchPrefix, sanitizeBranchName } from "shared/utils/branch";
import { ExistingWorktreesList } from "./components/ExistingWorktreesList";

function generateSlugFromTitle(title: string): string {
	return sanitizeBranchName(title);
}

type Mode = "existing" | "new" | "cloud";

export function NewWorkspaceModal() {
	const navigate = useNavigate();
	const isOpen = useNewWorkspaceModalOpen();
	const closeModal = useCloseNewWorkspaceModal();
	const preSelectedProjectId = usePreSelectedProjectId();
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

	const { data: recentProjects = [] } =
		electronTrpc.projects.getRecents.useQuery();
	const { data: project } = electronTrpc.projects.get.useQuery(
		{ id: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const {
		data: branchData,
		isLoading: isBranchesLoading,
		isError: isBranchesError,
	} = electronTrpc.projects.getBranches.useQuery(
		{ projectId: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery(
		{ id: selectedProjectId ?? "" },
		{ enabled: !!selectedProjectId },
	);
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();
	const createWorkspace = useCreateWorkspace();
	const { openNew } = useOpenProject();

	const resolvedPrefix = useMemo(() => {
		const projectOverrides = project?.branchPrefixMode != null;
		return resolveBranchPrefix({
			mode: projectOverrides
				? project?.branchPrefixMode
				: (globalBranchPrefix?.mode ?? "none"),
			customPrefix: projectOverrides
				? project?.branchPrefixCustom
				: globalBranchPrefix?.customPrefix,
			authorPrefix: gitAuthor?.prefix,
			githubUsername: gitInfo?.githubUsername,
		});
	}, [project, globalBranchPrefix, gitAuthor, gitInfo]);

	const filteredBranches = useMemo(() => {
		if (!branchData?.branches) return [];
		if (!branchSearch) return branchData.branches;
		const searchLower = branchSearch.toLowerCase();
		return branchData.branches.filter((b) =>
			b.name.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, branchSearch]);

	useEffect(() => {
		if (isOpen && !selectedProjectId && preSelectedProjectId) {
			setSelectedProjectId(preSelectedProjectId);
		}
	}, [isOpen, selectedProjectId, preSelectedProjectId]);

	const effectiveBaseBranch = resolveEffectiveWorkspaceBaseBranch({
		explicitBaseBranch: baseBranch,
		workspaceBaseBranch: project?.workspaceBaseBranch,
		defaultBranch: branchData?.defaultBranch,
		branches: branchData?.branches,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when project changes
	useEffect(() => {
		setBaseBranch(null);
	}, [selectedProjectId]);

	const branchSlug = branchNameEdited
		? sanitizeBranchName(branchName)
		: generateSlugFromTitle(title);

	const applyPrefix = !branchNameEdited;

	const branchPreview =
		branchSlug && applyPrefix && resolvedPrefix
			? `${resolvedPrefix}/${branchSlug}`
			: branchSlug;

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

	useEffect(() => {
		if (isOpen && selectedProjectId && mode === "new") {
			const timer = setTimeout(() => titleInputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedProjectId, mode]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (
			e.key === "Enter" &&
			!e.shiftKey &&
			mode === "new" &&
			selectedProjectId &&
			!createWorkspace.isPending
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

	const handleBranchNameBlur = () => {
		if (!branchName.trim()) {
			setBranchName("");
			setBranchNameEdited(false);
		}
	};

	const handleImportRepo = async () => {
		try {
			const projects = await openNew();

			if (projects.length > 1) {
				toast.success(`${projects.length} projects imported`);
			}

			if (projects.length > 0) {
				setSelectedProjectId(projects[0].id);
			}
		} catch (error) {
			toast.error("Failed to open project", {
				description:
					error instanceof Error ? error.message : "An unknown error occurred",
			});
		}
	};

	const selectedProject = recentProjects.find(
		(p) => p.id === selectedProjectId,
	);

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId) return;

		const workspaceName = title.trim() || undefined;

		handleClose();

		try {
			const result = await createWorkspace.mutateAsync({
				projectId: selectedProjectId,
				name: workspaceName,
				branchName: branchSlug || undefined,
				baseBranch: baseBranch || undefined,
				applyPrefix,
			});

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

	return (
		<Dialog modal open={isOpen} onOpenChange={(open) => !open && handleClose()}>
			<DialogContent
				className="sm:max-w-[440px] gap-0 p-0 overflow-hidden"
				onKeyDown={handleKeyDown}
			>
				<DialogHeader className="px-4 pt-4 pb-3">
					<DialogTitle className="text-base">Open Workspace</DialogTitle>
				</DialogHeader>

				<div className="px-4 pb-3">
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								variant="outline"
								className="w-full h-8 text-sm justify-between font-normal"
							>
								<span
									className={selectedProject ? "" : "text-muted-foreground"}
								>
									{selectedProject?.name ?? "Select project"}
								</span>
								<HiChevronDown className="size-4 text-muted-foreground" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent
							align="start"
							className="w-[--radix-dropdown-menu-trigger-width]"
						>
							{recentProjects
								.filter((project) => project.id)
								.map((project) => (
									<DropdownMenuItem
										key={project.id}
										onClick={() => setSelectedProjectId(project.id)}
									>
										{project.name}
										{project.id === selectedProjectId && (
											<HiCheck className="ml-auto size-4" />
										)}
									</DropdownMenuItem>
								))}
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={handleImportRepo}>
								<LuFolderOpen className="size-4" />
								Import repo
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
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
									Import
								</button>
								<button
									type="button"
									onClick={() => setMode("cloud")}
									className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
										mode === "cloud"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Cloud
								</button>
							</div>
						</div>

						<div className="px-4 pb-4">
							{mode === "new" && (
								<div className="space-y-3">
									<Input
										ref={titleInputRef}
										id="title"
										className="h-9 text-sm"
										placeholder="Feature name (press Enter to create)"
										value={title}
										onChange={(e) => setTitle(e.target.value)}
									/>

									{(title || branchNameEdited) && (
										<p className="text-xs text-muted-foreground flex items-center gap-1.5">
											<GoGitBranch className="size-3" />
											<span className="font-mono">
												{branchPreview || "branch-name"}
											</span>
											<span className="text-muted-foreground/60">
												from {effectiveBaseBranch ?? "..."}
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
												<div className="flex items-center justify-between">
													<label
														htmlFor="branch"
														className="text-xs text-muted-foreground"
													>
														Branch name
													</label>
													<button
														type="button"
														onClick={() => {
															handleClose();
															navigate({ to: "/settings/behavior" });
														}}
														className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
													>
														<HiOutlinePencil className="size-3" />
														<span>Edit prefix</span>
													</button>
												</div>
												<Input
													id="branch"
													className="h-8 text-sm font-mono"
													placeholder="auto-generated"
													value={branchNameEdited ? branchName : branchPreview}
													onChange={(e) =>
														handleBranchNameChange(e.target.value)
													}
													onBlur={handleBranchNameBlur}
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
														modal={false}
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
															onWheel={(e) => e.stopPropagation()}
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
							)}
							{mode === "existing" && (
								<ExistingWorktreesList
									projectId={selectedProjectId}
									onOpenSuccess={handleClose}
								/>
							)}
							{mode === "cloud" && (
								<div className="flex flex-col items-center justify-center py-8 text-center">
									<div className="text-sm font-medium text-foreground mb-1">
										Cloud Workspaces
									</div>
									<p className="text-xs text-muted-foreground">Coming soon</p>
								</div>
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
