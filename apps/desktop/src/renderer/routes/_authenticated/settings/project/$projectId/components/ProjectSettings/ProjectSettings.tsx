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
import { useEffect, useState } from "react";
import { HiOutlineCog6Tooth, HiOutlinePaintBrush } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	PROJECT_COLOR_DEFAULT,
	PROJECT_COLORS,
} from "shared/constants/project-colors";
import { resolveBranchPrefix, sanitizeSegment } from "shared/utils/branch";
import { ClickablePath } from "../../../../components/ClickablePath";
import { BRANCH_PREFIX_MODE_LABELS_WITH_DEFAULT } from "../../../../utils/branch-prefix";
import { ScriptsEditor } from "./components/ScriptsEditor";

function SettingsSection({
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
	const { data: gitAuthor } = electronTrpc.projects.getGitAuthor.useQuery({
		id: projectId,
	});
	const { data: globalBranchPrefix } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();

	const [customPrefixInput, setCustomPrefixInput] = useState(
		project?.branchPrefixCustom ?? "",
	);

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
				</SettingsSection>
			</div>
		</div>
	);
}
