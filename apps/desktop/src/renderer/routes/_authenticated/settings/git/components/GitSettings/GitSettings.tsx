import type { BranchPrefixMode } from "@superset/local-db";
import { Button } from "@superset/ui/button";
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
import { useCallback, useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { resolveBranchPrefix, sanitizeSegment } from "shared/utils/branch";
import {
	useDefaultWorktreePath,
	WorktreeLocationPicker,
} from "../../../components/WorktreeLocationPicker";
import { BRANCH_PREFIX_MODE_LABELS } from "../../../utils/branch-prefix";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface GitSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function GitSettings({ visibleItems }: GitSettingsProps) {
	const showDeleteLocalBranch = isItemVisible(
		SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH,
		visibleItems,
	);
	const showBranchPrefix = isItemVisible(
		SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
		visibleItems,
	);
	const showWorktreeLocation = isItemVisible(
		SETTING_ITEM_ID.GIT_WORKTREE_LOCATION,
		visibleItems,
	);
	const showOnedevConfig = isItemVisible(
		SETTING_ITEM_ID.GIT_ONEDEV_CONFIG,
		visibleItems,
	);
	const showProjectsDirectory = isItemVisible(
		SETTING_ITEM_ID.GIT_PROJECTS_DIRECTORY,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();

	const { data: deleteLocalBranch, isLoading: isDeleteBranchLoading } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery();
	const setDeleteLocalBranch =
		electronTrpc.settings.setDeleteLocalBranch.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getDeleteLocalBranch.cancel();
				const previous = utils.settings.getDeleteLocalBranch.getData();
				utils.settings.getDeleteLocalBranch.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getDeleteLocalBranch.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getDeleteLocalBranch.invalidate();
			},
		});

	const handleDeleteBranchToggle = (enabled: boolean) => {
		setDeleteLocalBranch.mutate({ enabled });
	};

	const { data: branchPrefix, isLoading: isBranchPrefixLoading } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		branchPrefix?.customPrefix ?? "",
	);

	useEffect(() => {
		setCustomPrefixInput(branchPrefix?.customPrefix ?? "");
	}, [branchPrefix?.customPrefix]);

	const setBranchPrefix = electronTrpc.settings.setBranchPrefix.useMutation({
		onError: (err) => {
			console.error("[settings/branch-prefix] Failed to update:", err);
		},
		onSettled: () => {
			utils.settings.getBranchPrefix.invalidate();
		},
	});

	const handleBranchPrefixModeChange = (mode: BranchPrefixMode) => {
		setBranchPrefix.mutate({
			mode,
			customPrefix: customPrefixInput || null,
		});
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		setBranchPrefix.mutate({
			mode: "custom",
			customPrefix: sanitized || null,
		});
	};

	const { data: worktreeBaseDir, isLoading: isWorktreeBaseDirLoading } =
		electronTrpc.settings.getWorktreeBaseDir.useQuery();
	const setWorktreeBaseDir =
		electronTrpc.settings.setWorktreeBaseDir.useMutation({
			onMutate: async ({ path }) => {
				await utils.settings.getWorktreeBaseDir.cancel();
				const previous = utils.settings.getWorktreeBaseDir.getData();
				utils.settings.getWorktreeBaseDir.setData(undefined, path);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getWorktreeBaseDir.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getWorktreeBaseDir.invalidate();
			},
		});
	const defaultWorktreePath = useDefaultWorktreePath();

	// Projects base dir
	const { data: projectsBaseDir, isLoading: isProjectsBaseDirLoading } =
		electronTrpc.settings.getProjectsBaseDir.useQuery();
	const setProjectsBaseDir =
		electronTrpc.settings.setProjectsBaseDir.useMutation({
			onMutate: async ({ path }) => {
				await utils.settings.getProjectsBaseDir.cancel();
				const previous = utils.settings.getProjectsBaseDir.getData();
				utils.settings.getProjectsBaseDir.setData(undefined, path);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getProjectsBaseDir.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getProjectsBaseDir.invalidate();
			},
		});

	// OneDev config
	const { data: onedevConfig, isLoading: isOnedevLoading } =
		electronTrpc.settings.getOnedevConfig.useQuery();
	const [onedevUrlInput, setOnedevUrlInput] = useState("");
	const [onedevTokenInput, setOnedevTokenInput] = useState("");
	const [onedevTestStatus, setOnedevTestStatus] = useState<
		"idle" | "testing" | "success" | "error"
	>("idle");

	useEffect(() => {
		if (onedevConfig) {
			setOnedevUrlInput(onedevConfig.url ?? "");
			setOnedevTokenInput(onedevConfig.accessToken ?? "");
		}
	}, [onedevConfig]);

	const setOnedevConfig = electronTrpc.settings.setOnedevConfig.useMutation({
		onError: (err) => {
			console.error("[settings/onedev] Failed to update:", err);
		},
		onSettled: () => {
			utils.settings.getOnedevConfig.invalidate();
		},
	});

	const handleOnedevSave = useCallback(() => {
		setOnedevConfig.mutate({
			url: onedevUrlInput.trim() || null,
			accessToken: onedevTokenInput.trim() || null,
		});
	}, [onedevUrlInput, onedevTokenInput, setOnedevConfig]);

	const testOnedevConnection =
		electronTrpc.settings.testOnedevConnection.useMutation({
			onSuccess: (result) => {
				setOnedevTestStatus(result.success ? "success" : "error");
			},
			onError: () => {
				setOnedevTestStatus("error");
			},
		});

	const handleOnedevTest = useCallback(() => {
		if (!onedevUrlInput.trim() || !onedevTokenInput.trim()) return;
		setOnedevTestStatus("testing");
		testOnedevConnection.mutate({
			url: onedevUrlInput.trim(),
			accessToken: onedevTokenInput.trim(),
		});
	}, [onedevUrlInput, onedevTokenInput, testOnedevConnection]);

	const previewPrefix =
		resolveBranchPrefix({
			mode: branchPrefix?.mode ?? "none",
			customPrefix: customPrefixInput,
			authorPrefix: gitInfo?.authorPrefix,
			githubUsername: gitInfo?.githubUsername,
		}) ||
		(branchPrefix?.mode === "author"
			? "author-name"
			: branchPrefix?.mode === "github"
				? "username"
				: null);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Git & Worktrees</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure git branch and worktree behavior
				</p>
			</div>

			<div className="space-y-6">
				{showDeleteLocalBranch && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="delete-local-branch"
								className="text-sm font-medium"
							>
								Delete local branch on workspace removal
							</Label>
							<p className="text-xs text-muted-foreground">
								Also delete the local git branch when deleting a worktree
								workspace
							</p>
						</div>
						<Switch
							id="delete-local-branch"
							checked={deleteLocalBranch ?? false}
							onCheckedChange={handleDeleteBranchToggle}
							disabled={isDeleteBranchLoading || setDeleteLocalBranch.isPending}
						/>
					</div>
				)}

				{showBranchPrefix && (
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
								value={branchPrefix?.mode ?? "none"}
								onValueChange={(value) =>
									handleBranchPrefixModeChange(value as BranchPrefixMode)
								}
								disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS) as [
											BranchPrefixMode,
											string,
										][]
									).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{branchPrefix?.mode === "custom" && (
								<Input
									placeholder="Prefix"
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
								/>
							)}
						</div>
					</div>
				)}

				{showWorktreeLocation && (
					<div className="space-y-0.5">
						<Label className="text-sm font-medium">Worktree location</Label>
						<p className="text-xs text-muted-foreground">
							Base directory for new worktrees
						</p>
						<WorktreeLocationPicker
							currentPath={worktreeBaseDir}
							defaultPathLabel={`Default (${defaultWorktreePath})`}
							defaultBrowsePath={worktreeBaseDir}
							disabled={
								isWorktreeBaseDirLoading || setWorktreeBaseDir.isPending
							}
							onSelect={(path) => setWorktreeBaseDir.mutate({ path })}
							onReset={() => setWorktreeBaseDir.mutate({ path: null })}
						/>
					</div>
				)}

				{showProjectsDirectory && (
					<div className="space-y-0.5">
						<Label className="text-sm font-medium">Projects directory</Label>
						<p className="text-xs text-muted-foreground">
							Default directory where new projects are cloned
						</p>
						<WorktreeLocationPicker
							currentPath={projectsBaseDir}
							defaultPathLabel="Not set"
							defaultBrowsePath={projectsBaseDir}
							disabled={
								isProjectsBaseDirLoading || setProjectsBaseDir.isPending
							}
							onSelect={(path) => setProjectsBaseDir.mutate({ path })}
							onReset={() => setProjectsBaseDir.mutate({ path: null })}
						/>
					</div>
				)}

				{showOnedevConfig && (
					<div className="space-y-3 border-t pt-6">
						<div>
							<Label className="text-sm font-medium">OneDev</Label>
							<p className="text-xs text-muted-foreground">
								Connect to a self-hosted OneDev server for pull request creation
							</p>
						</div>
						<div className="space-y-2">
							<div className="space-y-1">
								<Label htmlFor="onedev-url" className="text-xs">
									Server URL
								</Label>
								<Input
									id="onedev-url"
									placeholder="https://onedev.example.com"
									value={onedevUrlInput}
									onChange={(e) => {
										setOnedevUrlInput(e.target.value);
										setOnedevTestStatus("idle");
									}}
									onBlur={handleOnedevSave}
									disabled={isOnedevLoading}
								/>
							</div>
							<div className="space-y-1">
								<Label htmlFor="onedev-token" className="text-xs">
									Access Token
								</Label>
								<Input
									id="onedev-token"
									type="password"
									placeholder="Your OneDev access token"
									value={onedevTokenInput}
									onChange={(e) => {
										setOnedevTokenInput(e.target.value);
										setOnedevTestStatus("idle");
									}}
									onBlur={handleOnedevSave}
									disabled={isOnedevLoading}
								/>
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={handleOnedevTest}
									disabled={
										!onedevUrlInput.trim() ||
										!onedevTokenInput.trim() ||
										onedevTestStatus === "testing"
									}
								>
									{onedevTestStatus === "testing"
										? "Testing..."
										: "Test Connection"}
								</Button>
								{onedevTestStatus === "success" && (
									<span className="text-xs text-green-600">
										Connected successfully
									</span>
								)}
								{onedevTestStatus === "error" && (
									<span className="text-xs text-red-600">
										Connection failed
									</span>
								)}
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
