import type { BranchPrefixMode } from "@superset/local-db";
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
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@superset/ui/command";
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
import { cn } from "@superset/ui/utils";
import { useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	HiCheck,
	HiChevronUpDown,
	HiOutlineCog6Tooth,
	HiOutlineCommandLine,
	HiOutlineFolderOpen,
	HiOutlinePaintBrush,
} from "react-icons/hi2";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";
import { ColorSelector } from "renderer/components/ColorSelector";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { formatRelativeTime } from "renderer/lib/formatRelativeTime";
import {
	useImportAllWorktrees,
	useOpenExternalWorktree,
} from "renderer/react-query/workspaces";
import { resolveBranchPrefix, sanitizeSegment } from "shared/utils/branch";
import { ClickablePath } from "../../../../components/ClickablePath";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "../../../../components/WorktreeLocationPicker";
import { BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT } from "../../../../utils/branch-prefix";
import type { SettingItemId } from "../../../../utils/settings-search";
import {
	isItemVisible,
	SETTING_ITEM_ID,
} from "../../../../utils/settings-search";
import { ProjectSettingsHeader } from "../ProjectSettingsHeader";
import { ScriptsEditor } from "./components/ScriptsEditor";


export function SettingsSection({
	icon,
	title,
	description,
	children,
}: {
	icon: ReactNode;
	title: string;
	description?: string;
	children: ReactNode;
}) {
	return (
		<div className="pt-3 border-t space-y-3">
			<div>
				<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
					{icon}
					{title}
				</h3>
				{description && (
					<p className="text-xs text-muted-foreground mt-1">{description}</p>
				)}
			</div>
			{children}
		</div>
	);
}

interface ProjectSettingsProps {
	projectId: string;
	visibleItems?: SettingItemId[] | null;
}

export function ProjectSettings({
	projectId,
	visibleItems,
}: ProjectSettingsProps) {
	const navigate = useNavigate();
	const utils = electronTrpc.useUtils();
	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const { data: localBranchData, isLoading: isLocalBranchDataLoading } =
		electronTrpc.projects.getBranchesLocal.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);
	const { data: remoteBranchData } =
		electronTrpc.projects.getBranches.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);
	// Use remote data when available, fall back to fast local data
	const branchData = remoteBranchData ?? localBranchData;
	const isBranchDataLoading = isLocalBranchDataLoading;
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery({
		id: projectId,
	});
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		project?.branchPrefixCustom ?? "",
	);
	const [selectedWorktreePath, setSelectedWorktreePath] = useState<
		string | null
	>(null);
	const [baseBranchOpen, setBaseBranchOpen] = useState(false);
	const [baseBranchSearch, setBaseBranchSearch] = useState("");



	const filteredBranches = useMemo(() => {
		const branches = (branchData?.branches ?? []).map((branch) => {
			// storedValue: always the full remote-qualified name (for persistence + trigger)
			const storedValue =
				branch.isRemote && !branch.name.includes("/")
					? `origin/${branch.name}`
					: branch.name;
			// menuLabel: origin branches always plain, non-origin remotes always prefixed
			const menuLabel = branch.name;
			return { ...branch, storedValue, menuLabel };
		});
		if (!baseBranchSearch) return branches;
		const searchLower = baseBranchSearch.toLowerCase();
		return branches.filter(
			(branch) =>
				branch.menuLabel.toLowerCase().includes(searchLower) ||
				branch.storedValue.toLowerCase().includes(searchLower),
		);
	}, [branchData?.branches, baseBranchSearch]);

	useEffect(() => {
		setCustomPrefixInput(project?.branchPrefixCustom ?? "");
	}, [project?.branchPrefixCustom]);

	const updateProject = electronTrpc.projects.update.useMutation({
		onError: (err) => {
			console.error("[project-settings/update] Failed to update:", err);
		},
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const setProjectIcon = electronTrpc.projects.setProjectIcon.useMutation({
		onError: (err) => {
			console.error("[project-settings/setProjectIcon] Failed:", err);
		},
		onSettled: () => {
			utils.projects.get.invalidate({ id: projectId });
			utils.workspaces.getAllGrouped.invalidate();
		},
	});

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleIconUpload = useCallback(() => {
		if (!fileInputRef.current) return;
		fileInputRef.current.value = "";
		fileInputRef.current.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const file = e.target.files?.[0];
			if (!file) return;

			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				setProjectIcon.mutate({ id: projectId, icon: dataUrl });
			};
			reader.readAsDataURL(file);

			// Reset input so the same file can be re-selected
			e.target.value = "";
		},
		[projectId, setProjectIcon],
	);

	const handleRemoveIcon = useCallback(() => {
		setProjectIcon.mutate({ id: projectId, icon: null });
	}, [projectId, setProjectIcon]);

	const handleBranchPrefixModeChange = (value: string) => {
		if (value === "default") {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: null,
					branchPrefixCustom: customPrefixInput || null,
				},
			});
		} else {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: value as BranchPrefixMode,
					branchPrefixCustom: customPrefixInput || null,
				},
			});
		}
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		updateProject.mutate({
			id: projectId,
			patch: {
				branchPrefixMode: "custom",
				branchPrefixCustom: sanitized || null,
			},
		});
	};

	const handleWorkspaceBaseBranchChange = (value: string) => {
		updateProject.mutate({
			id: projectId,
			patch: {
				workspaceBaseBranch: value,
			},
		});
	};

	const { data: globalWorktreeBaseDir } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery();
	const defaultWorktreePath = useDefaultWorktreePath();
	const globalPath = globalWorktreeBaseDir ?? defaultWorktreePath;

	const { data: externalWorktrees = [], isLoading: isExternalLoading } =
		electronTrpc.workspaces.getExternalWorktrees.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);
	const importAllWorktrees = useImportAllWorktrees();
	const openExternalWorktree = useOpenExternalWorktree();

	const handleImportAll = async () => {
		try {
			const result = await importAllWorktrees.mutateAsync({ projectId });
			toast.success(
				`Imported ${result.imported} workspace${result.imported === 1 ? "" : "s"}`,
			);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Failed to import worktrees",
			);
		}
	};

	const handleImportWorktree = async (path: string, branch: string) => {
		toast.promise(
			openExternalWorktree.mutateAsync({
				projectId,
				worktreePath: path,
				branch,
			}),
			{
				loading: "Importing worktree...",
				success: `Imported ${branch}`,
				error: (err) =>
					err instanceof Error ? err.message : "Failed to import worktree",
			},
		);
	};

	const getPreviewPrefix = (
		mode: BranchPrefixMode | "default",
	): string | null => {
		if (mode === "default") {
			return getPreviewPrefix(globalBranchPrefix?.mode ?? "none");
		}
		return (
			resolveBranchPrefix({
				mode,
				customPrefix: customPrefixInput,
				authorPrefix: gitAuthor?.prefix,
				githubUsername: gitInfo?.githubUsername,
			}) ||
			(mode === "author"
				? "author-name"
				: mode === "github"
					? "username"
					: null)
		);
	};

	if (!project) {
		return null;
	}

	const currentMode = project.branchPrefixMode ?? "default";
	const previewPrefix = getPreviewPrefix(currentMode);
	const rawDefaultBranch =
		branchData?.defaultBranch ?? project.defaultBranch ?? "main";
	const repoDefaultBranch = rawDefaultBranch.includes("/")
		? rawDefaultBranch
		: `origin/${rawDefaultBranch}`;
	const workspaceBaseBranchMissing =
		!isBranchDataLoading &&
		!!project.workspaceBaseBranch &&
		!!branchData &&
		!branchData.branches.some((branch) => {
			const stored =
				branch.isRemote && !branch.name.includes("/")
					? `origin/${branch.name}`
					: branch.name;
			return stored === project.workspaceBaseBranch;
		});
	const workspaceBaseBranchValue =
		workspaceBaseBranchMissing
			? repoDefaultBranch
			: (project.workspaceBaseBranch ?? repoDefaultBranch);

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<ProjectSettingsHeader title={project.name}>
				<ClickablePath path={project.mainRepoPath} />
			</ProjectSettingsHeader>

			<div className="space-y-4">
				<SettingsSection
					icon={<HiOutlineCog6Tooth className="h-4 w-4" />}
					title="Branch Prefix"
					description="Override the default prefix for new workspaces."
				>
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Branch Prefix</Label>
							<p className="text-xs text-muted-foreground">
								Preview:{" "}
								<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
									{previewPrefix
										? `${previewPrefix}/branch-name`
										: "branch-name"}
								</code>
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Select
								value={currentMode}
								onValueChange={handleBranchPrefixModeChange}
								disabled={updateProject.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT) as [
											BranchPrefixMode | "default",
											string,
										][]
									).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{currentMode === "custom" && (
								<Input
									placeholder="Prefix"
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={updateProject.isPending}
								/>
							)}
						</div>
					</div>
				</SettingsSection>

				<SettingsSection
					icon={<HiOutlineCog6Tooth className="h-4 w-4" />}
					title="Workspace Base Branch"
					description="Set the default base branch for new workspaces in this repository."
				>
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Default Base Branch</Label>
							<p className="text-xs text-muted-foreground">
								Used when creating a workspace unless you choose a one-off base
								branch.
							</p>
						</div>
						<Popover
							open={baseBranchOpen}
							onOpenChange={(v) => {
								setBaseBranchOpen(v);
								if (!v) setBaseBranchSearch("");
								if (v) {
									requestAnimationFrame(() => {
										const selected = document.querySelector(
											"[data-selected='']",
										);
										selected?.scrollIntoView({ block: "nearest" });
									});
								}
							}}
						>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className="w-[260px] justify-between font-normal"
									disabled={updateProject.isPending || isBranchDataLoading}
								>
									{isBranchDataLoading ? (
										<span className="text-muted-foreground">Loading...</span>
									) : (
										<span className="truncate">
											{workspaceBaseBranchValue}
										</span>
									)}
									<HiChevronUpDown className="ml-2 size-4 shrink-0 opacity-50" />
								</Button>
							</PopoverTrigger>
							<PopoverContent
								className="w-[300px] p-0"
								align="end"
								onWheel={(event) => event.stopPropagation()}
							>
								<Command shouldFilter={false}>
									<CommandInput
										placeholder="Search branches..."
										value={baseBranchSearch}
										onValueChange={setBaseBranchSearch}
									/>
									<CommandList className="max-h-[300px]">
										<CommandEmpty>No branches found</CommandEmpty>
										<CommandGroup>
											{filteredBranches.map((branch) => (
												<CommandItem
													key={branch.storedValue}
													value={branch.menuLabel}
													onSelect={() => {
														handleWorkspaceBaseBranchChange(branch.storedValue);
														setBaseBranchOpen(false);
													}}
													className="flex items-center justify-between"
													data-selected={workspaceBaseBranchValue === branch.storedValue ? "" : undefined}
												>
													<span className="truncate">
														{branch.menuLabel}
													</span>
													<span className="flex items-center gap-2 shrink-0">
														{branch.lastCommitDate > 0 && (
															<span className="text-xs text-muted-foreground">
																{formatRelativeTime(branch.lastCommitDate)}
															</span>
														)}
														{workspaceBaseBranchValue === branch.storedValue && (
															<HiCheck className="size-4 text-primary" />
														)}
													</span>
												</CommandItem>
											))}
										</CommandGroup>
									</CommandList>
								</Command>
							</PopoverContent>
						</Popover>
					</div>
					{workspaceBaseBranchMissing && (
						<p className="text-xs text-destructive">
							Branch "{project.workspaceBaseBranch}" no longer exists. New
							workspaces will fall back to "{repoDefaultBranch}".
						</p>
					)}
				</SettingsSection>

				<SettingsSection
					icon={<HiOutlineFolderOpen className="h-4 w-4" />}
					title="Worktrees"
					description="Manage worktree location and import existing worktrees."
				>
					<WorktreeLocationPicker
						currentPath={project.worktreeBaseDir}
						defaultPathLabel={`Using global default: ${globalPath}`}
						dialogTitle="Select worktree location for this project"
						defaultBrowsePath={project.worktreeBaseDir ?? globalWorktreeBaseDir}
						disabled={updateProject.isPending}
						onSelect={(path) =>
							updateProject.mutate({
								id: projectId,
								patch: { worktreeBaseDir: path },
							})
						}
						onReset={() =>
							updateProject.mutate({
								id: projectId,
								patch: { worktreeBaseDir: null },
							})
						}
					/>

					{!isExternalLoading &&
						externalWorktrees.length > 0 &&
						isItemVisible(
							SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES,
							visibleItems,
						) && (
							<div className="flex items-center justify-between">
								<div className="space-y-0.5">
									<Label className="text-sm font-medium">
										Import Worktrees
									</Label>
									<p className="text-xs text-muted-foreground">
										{externalWorktrees.length} external worktree
										{externalWorktrees.length === 1 ? "" : "s"} found on disk.
									</p>
								</div>
								<div className="flex items-center gap-2">
									<Select
										value={selectedWorktreePath ?? "__all__"}
										onValueChange={(value) =>
											setSelectedWorktreePath(
												value === "__all__" ? null : value,
											)
										}
									>
										<SelectTrigger className="w-[220px]">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__all__">
												All worktrees ({externalWorktrees.length})
											</SelectItem>
											{externalWorktrees.map((wt) => (
												<SelectItem key={wt.path} value={wt.path}>
													{wt.branch}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									{selectedWorktreePath ? (
										<Button
											size="sm"
											className="w-22"
											disabled={openExternalWorktree.isPending}
											onClick={() => {
												const wt = externalWorktrees.find(
													(w) => w.path === selectedWorktreePath,
												);
												if (wt) {
													handleImportWorktree(wt.path, wt.branch);
													setSelectedWorktreePath(null);
												}
											}}
										>
											{openExternalWorktree.isPending
												? "Importing..."
												: "Import"}
										</Button>
									) : (
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													size="sm"
													className="w-22"
													disabled={importAllWorktrees.isPending}
												>
													{importAllWorktrees.isPending
														? "Importing..."
														: "Import all"}
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent>
												<AlertDialogHeader>
													<AlertDialogTitle>
														Import all worktrees
													</AlertDialogTitle>
													<AlertDialogDescription>
														This will import {externalWorktrees.length} external
														worktree
														{externalWorktrees.length === 1 ? "" : "s"} into
														Superset as workspaces. Each worktree on disk will
														be tracked and appear in your sidebar. No files will
														be modified.
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
								</div>
							</div>
						)}
				</SettingsSection>

				<SettingsSection
					icon={<HiOutlineCommandLine className="h-4 w-4" />}
					title="Terminal Presets"
					description="Create repo-specific terminal presets without leaving settings."
				>
					<div className="flex items-center justify-between gap-4">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Project Presets</Label>
							<p className="text-xs text-muted-foreground">
								New presets can be limited to this project or expanded later to
								multiple projects.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() =>
									navigate({
										to: "/settings/terminal",
									})
								}
							>
								Manage Presets
							</Button>
							<Button
								type="button"
								onClick={() =>
									navigate({
										to: "/settings/terminal",
										search: { createProjectId: projectId },
									})
								}
							>
								New Preset for This Project
							</Button>
						</div>
					</div>
				</SettingsSection>

				<div className="pt-3 border-t">
					<ScriptsEditor projectId={project.id} />
				</div>

				<SettingsSection
					icon={<HiOutlinePaintBrush className="h-4 w-4" />}
					title="Appearance"
					description="Customize this project's sidebar look."
				>
					<div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
						<ColorSelector
							selectedColor={project.color}
							onSelectColor={(color) =>
								updateProject.mutate({
									id: projectId,
									patch: { color },
								})
							}
							className="max-w-xl"
						/>
						<div className="flex items-center gap-2">
							<Label className="text-sm text-muted-foreground">
								Hide Image
							</Label>
							<Switch
								checked={project.hideImage ?? false}
								onCheckedChange={(checked) =>
									updateProject.mutate({
										id: projectId,
										patch: { hideImage: checked },
									})
								}
							/>
						</div>
					</div>

					{/* Project Icon */}
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Project Icon</Label>
							<p className="text-xs text-muted-foreground">
								Upload a custom icon for the sidebar.
							</p>
						</div>
						<div className="flex items-center gap-2">
							{project.iconUrl && (
								<img
									src={project.iconUrl}
									alt="Project icon"
									className="size-8 rounded object-cover border"
								/>
							)}
							<input
								ref={fileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/svg+xml,image/x-icon"
								className="hidden"
								onChange={handleFileChange}
							/>
							<button
								type="button"
								onClick={handleIconUpload}
								disabled={setProjectIcon.isPending}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border",
									"hover:bg-muted transition-colors",
								)}
							>
								<LuImagePlus className="size-4" />
								{project.iconUrl ? "Replace" : "Upload"}
							</button>
							{project.iconUrl && (
								<button
									type="button"
									onClick={handleRemoveIcon}
									disabled={setProjectIcon.isPending}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border",
										"hover:bg-destructive/10 text-destructive transition-colors",
									)}
								>
									<LuTrash2 className="size-4" />
									Remove
								</button>
							)}
						</div>
					</div>
				</SettingsSection>
			</div>
		</div>
	);
}
