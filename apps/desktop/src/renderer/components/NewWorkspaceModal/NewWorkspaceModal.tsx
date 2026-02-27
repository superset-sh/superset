import {
	AGENT_LABELS,
	AGENT_TYPES,
	type AgentType,
	buildAgentPromptCommand,
} from "@superset/shared/agent-command";
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
import { Switch } from "@superset/ui/switch";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { GoGitBranch } from "react-icons/go";
import {
	HiCheck,
	HiChevronDown,
	HiChevronLeft,
	HiChevronUpDown,
	HiOutlinePencil,
} from "react-icons/hi2";
import { LuFolderOpen } from "react-icons/lu";
import {
	getPresetIcon,
	useIsDarkTheme,
} from "renderer/assets/app-icons/preset-icons";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import { launchCommandInPane } from "renderer/lib/terminal/launch-command";
import { resolveEffectiveWorkspaceBaseBranch } from "renderer/lib/workspaceBaseBranch";
import { useOpenProject } from "renderer/react-query/projects";
import { useCreateWorkspace } from "renderer/react-query/workspaces";
import {
	useCloseNewWorkspaceModal,
	useNewWorkspaceModalOpen,
	usePreSelectedProjectId,
} from "renderer/stores/new-workspace-modal";
import { useTabsStore } from "renderer/stores/tabs/store";
import { useWorkspaceInitStore } from "renderer/stores/workspace-init";
import { resolveBranchPrefix, sanitizeBranchName } from "shared/utils/branch";
import type { ImportSourceTab } from "./components/ExistingWorktreesList";
import { ImportFlow } from "./components/ImportFlow";

function generateSlugFromTitle(title: string): string {
	return sanitizeBranchName(title);
}

type Mode = "existing" | "new";
type WorkspaceCreateAgent = AgentType | "none";
const WORKSPACE_AGENT_STORAGE_KEY = "lastSelectedWorkspaceCreateAgent";

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
	const [runSetupScript, setRunSetupScript] = useState(true);
	const [importTab, setImportTab] = useState<ImportSourceTab>("pull-request");
	const [selectedAgent, setSelectedAgent] = useState<WorkspaceCreateAgent>(
		() => {
			if (typeof window === "undefined") return "none";
			const stored = window.localStorage.getItem(WORKSPACE_AGENT_STORAGE_KEY);
			if (stored === "none") return "none";
			return stored && (AGENT_TYPES as readonly string[]).includes(stored)
				? (stored as AgentType)
				: "none";
		},
	);
	const runSetupScriptRef = useRef(true);
	runSetupScriptRef.current = runSetupScript;
	const titleInputRef = useRef<HTMLTextAreaElement>(null);
	const isDark = useIsDarkTheme();

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
	const terminalCreateOrAttach =
		electronTrpc.terminal.createOrAttach.useMutation();
	const terminalWrite = electronTrpc.terminal.write.useMutation();
	const createWorkspace = useCreateWorkspace({
		resolveInitialCommands: (commands) =>
			runSetupScriptRef.current ? commands : null,
	});
	const addTab = useTabsStore((s) => s.addTab);
	const removePane = useTabsStore((s) => s.removePane);
	const setTabAutoTitle = useTabsStore((s) => s.setTabAutoTitle);
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset form each time the modal opens
	useEffect(() => {
		if (!isOpen) return;
		resetForm();
		if (preSelectedProjectId) {
			setSelectedProjectId(preSelectedProjectId);
		}
	}, [isOpen]);

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
		setImportTab("pull-request");
		setBaseBranch(null);
		setBranchSearch("");
		setShowAdvanced(false);
		setRunSetupScript(true);
	};

	useEffect(() => {
		if (isOpen && selectedProjectId && mode === "new") {
			const timer = setTimeout(() => titleInputRef.current?.focus(), 50);
			return () => clearTimeout(timer);
		}
	}, [isOpen, selectedProjectId, mode]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.target instanceof HTMLTextAreaElement) {
			return;
		}

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
	const projectSelector = (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="outline"
							className="w-full h-8 text-sm justify-between font-normal"
						>
							<span className={selectedProject ? "" : "text-muted-foreground"}>
								{selectedProject?.name ?? "Select project"}
							</span>
							<HiChevronDown className="size-4 text-muted-foreground" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom" showArrow={false}>
						Repository
					</TooltipContent>
				</Tooltip>
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
	);
	const requiresPromptTitle = selectedAgent !== "none";
	const isCreateDisabled =
		createWorkspace.isPending ||
		isBranchesError ||
		(requiresPromptTitle && !title.trim());

	const handleCreateWorkspace = async () => {
		if (!selectedProjectId) return;
		const prompt = title.trim();
		if (selectedAgent !== "none" && !prompt) {
			toast.error("Enter a title to start an agent", {
				description: "The workspace title is used as the initial agent prompt.",
			});
			return;
		}

		const workspaceName = prompt || undefined;
		const agentCommand =
			selectedAgent === "none"
				? null
				: buildAgentPromptCommand({
						prompt,
						randomId: window.crypto.randomUUID(),
						agent: selectedAgent,
					});

		closeModal();

		try {
			const result = await createWorkspace.mutateAsync({
				projectId: selectedProjectId,
				name: workspaceName,
				branchName: branchSlug || undefined,
				baseBranch: baseBranch || undefined,
				applyPrefix,
			});

			if (agentCommand) {
				if (result.wasExisting) {
					const { tabId, paneId } = addTab(result.workspace.id);
					setTabAutoTitle(tabId, "Agent");
					try {
						await launchCommandInPane({
							paneId,
							tabId,
							workspaceId: result.workspace.id,
							command: agentCommand,
							createOrAttach: (input) =>
								terminalCreateOrAttach.mutateAsync(input),
							write: (input) => terminalWrite.mutateAsync(input),
						});
					} catch (error) {
						removePane(paneId);
						toast.error("Failed to start agent", {
							description:
								error instanceof Error
									? error.message
									: "Failed to start agent terminal session.",
						});
						return;
					}
				} else {
					const store = useWorkspaceInitStore.getState();
					const pending = store.pendingTerminalSetups[result.workspace.id];
					store.addPendingTerminalSetup({
						workspaceId: result.workspace.id,
						projectId: result.projectId,
						initialCommands: pending?.initialCommands ?? null,
						defaultPresets: pending?.defaultPresets,
						agentCommand,
					});
				}
			}

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
				showCloseButton={false}
			>
				<DialogHeader className="px-4 pt-4 pb-3 flex-row items-center justify-between space-y-0">
					{selectedProjectId && mode === "existing" && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setMode("new")}
						>
							<HiChevronLeft className="size-3.5" />
							Back
						</Button>
					)}
					<DialogTitle
						className={mode === "existing" ? "sr-only" : "text-base"}
					>
						New Workspace
					</DialogTitle>
					{selectedProjectId && mode === "new" && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="h-7 px-2 text-xs"
							onClick={() => setMode("existing")}
						>
							<LuFolderOpen className="size-3.5" />
							Import
						</Button>
					)}
					{selectedProjectId && mode === "existing" && (
						<div className="h-7 w-[56px]" />
					)}
				</DialogHeader>

				{!selectedProjectId && (
					<div className="px-4 pb-3">{projectSelector}</div>
				)}

				{selectedProjectId && (
					<div className="px-4 pb-4">
						{mode === "new" && (
							<div className="space-y-3">
								<div className="flex items-end gap-3">
									<div className="flex-1 space-y-1.5">
										<Label className="text-xs text-muted-foreground">
											Repository
										</Label>
										{projectSelector}
									</div>
									<div>
										<Select
											value={selectedAgent}
											onValueChange={(value: WorkspaceCreateAgent) => {
												setSelectedAgent(value);
												window.localStorage.setItem(
													WORKSPACE_AGENT_STORAGE_KEY,
													value,
												);
											}}
										>
											<Tooltip>
												<TooltipTrigger asChild>
													<SelectTrigger className="h-8 text-xs w-auto">
														<SelectValue placeholder="No agent" />
													</SelectTrigger>
												</TooltipTrigger>
												<TooltipContent side="bottom" showArrow={false}>
													Agent
												</TooltipContent>
											</Tooltip>
											<SelectContent>
												<SelectItem value="none">No agent</SelectItem>
												{AGENT_TYPES.map((agent) => {
													const icon = getPresetIcon(agent, isDark);
													return (
														<SelectItem key={agent} value={agent}>
															<span className="flex items-center gap-2">
																{icon && (
																	<img
																		src={icon}
																		alt=""
																		className="size-3.5 object-contain"
																	/>
																)}
																{AGENT_LABELS[agent]}
															</span>
														</SelectItem>
													);
												})}
											</SelectContent>
										</Select>
									</div>
								</div>

								<Textarea
									ref={titleInputRef}
									id="title"
									className="min-h-20 text-sm resize-y"
									placeholder="What do you want to do?"
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

								<Button
									className="w-full h-8 text-sm"
									onClick={handleCreateWorkspace}
									disabled={isCreateDisabled}
								>
									Create Workspace
								</Button>

								<Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
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
												onChange={(e) => handleBranchNameChange(e.target.value)}
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
																			{effectiveBaseBranch === branch.name && (
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
										<div className="flex items-center justify-between">
											<Label
												htmlFor="run-setup-script"
												className="text-xs text-muted-foreground"
											>
												Run setup script
											</Label>
											<Switch
												id="run-setup-script"
												checked={runSetupScript}
												onCheckedChange={setRunSetupScript}
											/>
										</div>
									</CollapsibleContent>
								</Collapsible>
							</div>
						)}
						{mode === "existing" && (
							<ImportFlow
								projectId={selectedProjectId}
								projectSelector={projectSelector}
								onOpenSuccess={handleClose}
								activeTab={importTab}
								onActiveTabChange={setImportTab}
							/>
						)}
					</div>
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
