import type { BranchPrefixMode } from "@superset/local-db";
import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { Switch } from "@superset/ui/switch";
import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	HiOutlineCog6Tooth,
	HiOutlineFolderOpen,
	HiOutlinePaintBrush,
} from "react-icons/hi2";
import { LuImagePlus, LuTrash2 } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import {
	DEFAULT_BRANCH_PREFIX_SEPARATOR,
	resolveBranchPrefix,
	sanitizeSegment,
} from "shared/utils/branch";
import { ClickablePath } from "../../../../components/ClickablePath";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "../../../../components/WorktreeLocationPicker";
import { BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT } from "../../../../utils/branch-prefix";
import { ScriptsEditor } from "./components/ScriptsEditor";

const REPO_DEFAULT_BASE_BRANCH = "__repo_default__";

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
}

export function ProjectSettings({ projectId }: ProjectSettingsProps) {
	const utils = electronTrpc.useUtils();
	const { data: project } = electronTrpc.projects.get.useQuery({
		id: projectId,
	});
	const { data: branchData, isLoading: isBranchDataLoading } =
		electronTrpc.projects.getBranches.useQuery(
			{ projectId },
			{ enabled: !!projectId },
		);
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery({
		id: projectId,
	});
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		project?.branchPrefixCustom ?? "",
	);
	const [separatorInput, setSeparatorInput] = useState(
		project?.branchPrefixSeparator ?? "",
	);

	useEffect(() => {
		setCustomPrefixInput(project?.branchPrefixCustom ?? "");
	}, [project?.branchPrefixCustom]);

	useEffect(() => {
		setSeparatorInput(project?.branchPrefixSeparator ?? "");
	}, [project?.branchPrefixSeparator]);

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
		fileInputRef.current?.click();
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
					branchPrefixSeparator: separatorInput || null,
				},
			});
		} else {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: value as BranchPrefixMode,
					branchPrefixCustom: customPrefixInput || null,
					branchPrefixSeparator: separatorInput || null,
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
				branchPrefixSeparator: separatorInput || null,
			},
		});
	};

	const handleSeparatorBlur = () => {
		updateProject.mutate({
			id: projectId,
			patch: {
				branchPrefixMode: project.branchPrefixMode ?? null,
				branchPrefixCustom: customPrefixInput || null,
				branchPrefixSeparator: separatorInput || null,
			},
		});
	};

	const handleWorkspaceBaseBranchChange = (value: string) => {
		updateProject.mutate({
			id: projectId,
			patch: {
				workspaceBaseBranch: value === REPO_DEFAULT_BASE_BRANCH ? null : value,
			},
		});
	};

	const { data: globalWorktreeBaseDir } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery();
	const defaultWorktreePath = useDefaultWorktreePath();
	const globalPath = globalWorktreeBaseDir ?? defaultWorktreePath;

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
	const effectiveSeparator =
		separatorInput ||
		globalBranchPrefix?.separator ||
		DEFAULT_BRANCH_PREFIX_SEPARATOR;
	const repoDefaultBranch =
		branchData?.defaultBranch ?? project.defaultBranch ?? "main";
	const workspaceBaseBranchValue =
		project.workspaceBaseBranch ?? REPO_DEFAULT_BASE_BRANCH;
	const workspaceBaseBranchMissing =
		!isBranchDataLoading &&
		!!project.workspaceBaseBranch &&
		!!branchData &&
		!branchData.branches.some(
			(branch) => branch.name === project.workspaceBaseBranch,
		);

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">{project.name}</h2>
				<ClickablePath path={project.mainRepoPath} />
			</div>

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
										? `${previewPrefix}${effectiveSeparator}branch-name`
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
							{currentMode !== "none" && currentMode !== "default" && (
								<Input
									placeholder="/"
									value={separatorInput}
									onChange={(e) => setSeparatorInput(e.target.value)}
									onBlur={handleSeparatorBlur}
									className="w-[60px]"
									disabled={updateProject.isPending}
									title="Separator between prefix and branch name"
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
						<Select
							value={workspaceBaseBranchValue}
							onValueChange={handleWorkspaceBaseBranchChange}
							disabled={updateProject.isPending || isBranchDataLoading}
						>
							<SelectTrigger className="w-[260px]">
								{isBranchDataLoading ? (
									<span className="text-muted-foreground">Loading...</span>
								) : (
									<SelectValue />
								)}
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={REPO_DEFAULT_BASE_BRANCH}>
									Use repository default ({repoDefaultBranch})
								</SelectItem>
								{workspaceBaseBranchMissing && project.workspaceBaseBranch && (
									<SelectItem value={project.workspaceBaseBranch}>
										{project.workspaceBaseBranch} (missing)
									</SelectItem>
								)}
								{(branchData?.branches ?? []).map((branch) => (
									<SelectItem key={branch.name} value={branch.name}>
										{branch.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
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
					title="Worktree Location"
					description="Override the global worktree directory for this project."
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
				</SettingsSection>

				<div className="pt-3 border-t">
					<ScriptsEditor projectId={project.id} />
				</div>

				<SettingsSection
					icon={<HiOutlinePaintBrush className="h-4 w-4" />}
					title="Appearance"
					description="Customize this project's sidebar look."
				>
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							{PROJECT_COLORS.map((color) => {
								const isDefault = color.value === PROJECT_COLOR_DEFAULT;
								const isSelected = project.color === color.value;
								return (
									<button
										key={color.value}
										type="button"
										title={color.name}
										onClick={() =>
											updateProject.mutate({
												id: projectId,
												patch: { color: color.value },
											})
										}
										className={cn(
											"size-6 rounded-full border-2 transition-transform hover:scale-110",
											isSelected
												? "border-foreground scale-110"
												: "border-transparent",
											isDefault && "bg-muted",
										)}
										style={
											isDefault ? undefined : { backgroundColor: color.value }
										}
									/>
								);
							})}
						</div>
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
