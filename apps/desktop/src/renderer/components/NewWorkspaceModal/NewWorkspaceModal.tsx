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
import { Label } from "@superset/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
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
import { LuArrowLeft, LuFolderOpen, LuLoader, LuServer } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import {
	processOpenNewResults,
	useOpenNew,
} from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import {
	resolveBranchPrefix,
	sanitizeBranchName,
	sanitizeSegment,
} from "shared/utils/branch";
import { ExistingWorktreesList } from "./components/ExistingWorktreesList";

function generateSlugFromTitle(title: string): string {
	return sanitizeSegment(title);
}

type Mode = "existing" | "new" | "cloud" | "remote";

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
	const [showSshForm, setShowSshForm] = useState(false);
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
	const openNew = useOpenNew();

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

	const effectiveBaseBranch = baseBranch ?? branchData?.defaultBranch ?? null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset when project changes
	useEffect(() => {
		setBaseBranch(null);
	}, [selectedProjectId]);

	// Auto-select "remote" mode when a remote project is selected
	useEffect(() => {
		if (project?.projectType === "remote") {
			setMode("remote");
		}
	}, [project?.projectType]);

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
		setShowSshForm(false);
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
			const result = await openNew.mutateAsync(undefined);
			if (result.canceled) return;

			if ("error" in result) {
				toast.error("Failed to open project", { description: result.error });
				return;
			}

			if ("results" in result) {
				const { successes } = processOpenNewResults({
					results: result.results,
					showSuccessToast: false,
					showGitInitToast: true,
				});

				if (successes.length > 1) {
					toast.success(`${successes.length} projects imported`);
				}

				if (successes.length > 0) {
					setSelectedProjectId(successes[0].project.id);
				}
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
				baseBranch: effectiveBaseBranch || undefined,
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
							<DropdownMenuItem
								onClick={() => {
									setSelectedProjectId(null);
									setShowSshForm(true);
								}}
							>
								<LuServer className="size-4" />
								Add SSH Remote
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{selectedProjectId && (
					<>
						<div className="px-4 pb-3">
							<div className="flex p-0.5 bg-muted rounded-md">
								{project?.projectType !== "remote" && (
									<>
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
									</>
								)}
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
								<button
									type="button"
									onClick={() => setMode("remote")}
									className={`flex-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
										mode === "remote"
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Remote
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
							{mode === "remote" && (
								<RemoteWorkspaceForm
									projectId={selectedProjectId}
									onSuccess={handleClose}
								/>
							)}
						</div>
					</>
				)}

				{!selectedProjectId && (
					<div className="px-4 pb-4 pt-2">
						{showSshForm ? (
							<SshRemoteProjectForm
								onSuccess={handleClose}
								onBack={() => setShowSshForm(false)}
							/>
						) : (
							<div className="text-center text-sm text-muted-foreground py-8">
								Select a project to get started
							</div>
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function RemoteWorkspaceForm({
	projectId,
	onSuccess,
}: {
	projectId: string;
	onSuccess: () => void;
}) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const [sshConnectionId, setSshConnectionId] = useState<string>("");
	const [remotePath, setRemotePath] = useState("");
	const [workspaceName, setWorkspaceName] = useState("");

	const { data: connections = [] } =
		electronTrpc.sshConnections.list.useQuery();

	const createRemote =
		electronTrpc.workspaces.createRemoteWorkspace.useMutation({
			onSuccess: (data) => {
				toast.success("Remote workspace created");
				utils.workspaces.getAllGrouped.invalidate();
				onSuccess();
				navigateToWorkspace(data.workspace.id, navigate, { replace: true });
			},
			onError: (err) => {
				toast.error(err.message);
			},
		});

	const handleCreate = () => {
		if (!sshConnectionId || !remotePath.trim()) return;
		createRemote.mutate({
			projectId,
			sshConnectionId,
			remotePath: remotePath.trim(),
			name: workspaceName.trim() || undefined,
		});
	};

	if (connections.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<LuServer className="size-8 text-muted-foreground mb-3" />
				<p className="text-sm font-medium">No SSH connections</p>
				<p className="text-xs text-muted-foreground mt-1 mb-3">
					Configure an SSH connection first.
				</p>
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						onSuccess();
						navigate({ to: "/settings/ssh-connections" });
					}}
				>
					Go to SSH Settings
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">SSH Connection</Label>
				<Select value={sshConnectionId} onValueChange={setSshConnectionId}>
					<SelectTrigger className="h-9 text-sm">
						<SelectValue placeholder="Select connection..." />
					</SelectTrigger>
					<SelectContent>
						{connections.map((conn) => (
							<SelectItem key={conn.id} value={conn.id}>
								{conn.name} ({conn.username}@{conn.host})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">
					Remote Repository Path
				</Label>
				<Input
					className="h-9 text-sm font-mono"
					placeholder="/home/user/project"
					value={remotePath}
					onChange={(e) => setRemotePath(e.target.value)}
				/>
			</div>

			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">
					Workspace Name (optional)
				</Label>
				<Input
					className="h-9 text-sm"
					placeholder="Auto-generated from path"
					value={workspaceName}
					onChange={(e) => setWorkspaceName(e.target.value)}
				/>
			</div>

			<Button
				className="w-full h-8 text-sm"
				onClick={handleCreate}
				disabled={
					!sshConnectionId || !remotePath.trim() || createRemote.isPending
				}
			>
				{createRemote.isPending && (
					<LuLoader className="size-4 animate-spin mr-1.5" />
				)}
				Create Remote Workspace
			</Button>
		</div>
	);
}

function SshRemoteProjectForm({
	onSuccess,
	onBack,
}: {
	onSuccess: () => void;
	onBack: () => void;
}) {
	const navigate = useNavigate();
	const [sshConnectionId, setSshConnectionId] = useState<string>("");
	const [remotePath, setRemotePath] = useState("");
	const [projectName, setProjectName] = useState("");

	const { data: connections = [] } =
		electronTrpc.sshConnections.list.useQuery();
	const utils = electronTrpc.useUtils();

	const createRemote = electronTrpc.projects.createRemote.useMutation({
		onSuccess: (data) => {
			toast.success("Remote project created");
			utils.projects.getRecents.invalidate();
			utils.workspaces.getAllGrouped.invalidate();
			onSuccess();
			navigateToWorkspace(data.workspace.id, navigate, { replace: true });
		},
		onError: (err) => {
			toast.error(err.message);
		},
	});

	const handleCreate = () => {
		if (!sshConnectionId || !remotePath.trim()) return;
		createRemote.mutate({
			sshConnectionId,
			remotePath: remotePath.trim(),
			name: projectName.trim() || undefined,
		});
	};

	if (connections.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-8 text-center">
				<LuServer className="size-8 text-muted-foreground mb-3" />
				<p className="text-sm font-medium">No SSH connections</p>
				<p className="text-xs text-muted-foreground mt-1 mb-3">
					Configure an SSH connection first.
				</p>
				<div className="flex gap-2">
					<Button variant="outline" size="sm" onClick={onBack}>
						<LuArrowLeft className="size-3.5" />
						Back
					</Button>
					<Button
						variant="outline"
						size="sm"
						onClick={() => {
							onSuccess();
							navigate({ to: "/settings/ssh-connections" });
						}}
					>
						Go to SSH Settings
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<button
				type="button"
				onClick={onBack}
				className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
			>
				<LuArrowLeft className="size-3" />
				Back to project selection
			</button>

			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">SSH Connection</Label>
				<Select value={sshConnectionId} onValueChange={setSshConnectionId}>
					<SelectTrigger className="h-9 text-sm">
						<SelectValue placeholder="Select connection..." />
					</SelectTrigger>
					<SelectContent>
						{connections.map((conn) => (
							<SelectItem key={conn.id} value={conn.id}>
								{conn.name} ({conn.username}@{conn.host})
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">Remote Path</Label>
				<Input
					className="h-9 text-sm font-mono"
					placeholder="/home/user/project"
					value={remotePath}
					onChange={(e) => setRemotePath(e.target.value)}
				/>
			</div>

			<div className="space-y-1.5">
				<Label className="text-xs text-muted-foreground">
					Project Name (optional)
				</Label>
				<Input
					className="h-9 text-sm"
					placeholder="Auto-generated from path"
					value={projectName}
					onChange={(e) => setProjectName(e.target.value)}
				/>
			</div>

			<Button
				className="w-full h-8 text-sm"
				onClick={handleCreate}
				disabled={
					!sshConnectionId || !remotePath.trim() || createRemote.isPending
				}
			>
				{createRemote.isPending && (
					<LuLoader className="size-4 animate-spin mr-1.5" />
				)}
				Connect
			</Button>
		</div>
	);
}
