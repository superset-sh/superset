import { Input } from "@superset/ui/input";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { HiOutlineCog6Tooth, HiOutlineFolder } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { ClickablePath } from "../../../../components/ClickablePath";
import { ScriptsEditor } from "./components/ScriptsEditor";

type BranchPrefixMode = "github" | "author" | "feat" | "custom" | "none";

const BRANCH_PREFIX_MODE_LABELS: Record<BranchPrefixMode | "default", string> =
	{
		default: "Use global default",
		github: "GitHub username",
		author: "Git author name",
		feat: '"feat" prefix',
		custom: "Custom prefix",
		none: "No prefix",
	};

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

	const updateProject = electronTrpc.projects.update.useMutation({
		onSuccess: () => {
			utils.projects.get.invalidate({ id: projectId });
		},
	});

	const handleBranchPrefixModeChange = (value: string) => {
		if (value === "default") {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: null,
					branchPrefixCustom: null,
				},
			});
		} else {
			updateProject.mutate({
				id: projectId,
				patch: {
					branchPrefixMode: value as BranchPrefixMode,
					branchPrefixCustom:
						value === "custom" ? project?.branchPrefixCustom : null,
				},
			});
		}
	};

	const handleCustomPrefixChange = (customPrefix: string) => {
		updateProject.mutate({
			id: projectId,
			patch: {
				branchPrefixMode: "custom",
				branchPrefixCustom: customPrefix || null,
			},
		});
	};

	const getPreviewPrefix = (
		mode: BranchPrefixMode | "default",
	): string | null => {
		switch (mode) {
			case "none":
				return null;
			case "feat":
				return "feat";
			case "custom":
				return project?.branchPrefixCustom || null;
			case "author":
				return gitAuthor?.prefix || "author-name";
			case "github":
				return gitInfo?.githubUsername || gitAuthor?.prefix || "username";
			default:
				// Resolve the global default
				return getPreviewPrefix(globalBranchPrefix?.mode ?? "github");
		}
	};

	if (!project) {
		return null;
	}

	const currentMode = project.branchPrefixMode ?? "default";
	const previewPrefix = getPreviewPrefix(currentMode);

	return (
		<div className="p-6 max-w-4xl w-full select-text">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Project</h2>
			</div>

			<div className="space-y-6">
				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground">Name</h3>
					<p>{project.name}</p>
				</div>

				<div className="space-y-2">
					<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
						<HiOutlineFolder className="h-4 w-4" />
						Repository Path
					</h3>
					<ClickablePath path={project.mainRepoPath} />
				</div>

				<div className="pt-4 border-t space-y-4">
					<div className="space-y-2">
						<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
							<HiOutlineCog6Tooth className="h-4 w-4" />
							Branch Prefix
						</h3>
						<p className="text-sm text-muted-foreground">
							Override the default branch prefix for new workspaces in this
							project.
						</p>
					</div>
					<div className="flex items-center gap-3">
						<div className="space-y-1.5">
							<Label className="text-xs text-muted-foreground">Mode</Label>
							<Select
								value={currentMode}
								onValueChange={handleBranchPrefixModeChange}
								disabled={updateProject.isPending}
							>
								<SelectTrigger className="w-[200px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS) as [
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
						</div>
						{currentMode === "custom" && (
							<div className="space-y-1.5">
								<Label className="text-xs text-muted-foreground">
									Custom Prefix
								</Label>
								<Input
									placeholder="Enter custom prefix"
									value={project.branchPrefixCustom ?? ""}
									onChange={(e) => handleCustomPrefixChange(e.target.value)}
									className="w-[200px]"
									disabled={updateProject.isPending}
								/>
							</div>
						)}
					</div>
					<p className="text-xs text-muted-foreground">
						Preview:{" "}
						<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
							{previewPrefix ? `${previewPrefix}/branch-name` : "branch-name"}
						</code>
					</p>
				</div>

				<div className="pt-4 border-t space-y-4">
					<div className="space-y-2">
						<h3 className="text-base font-semibold text-foreground flex items-center gap-2">
							<HiOutlineCog6Tooth className="h-4 w-4" />
							Scripts
						</h3>
						<p className="text-sm text-muted-foreground">
							Configure setup and teardown scripts that run when workspaces are
							created or deleted.
						</p>
					</div>
					<ScriptsEditor projectId={project.id} projectName={project.name} />
				</div>
			</div>
		</div>
	);
}
