import {
	HiOutlineCodeBracketSquare,
	HiOutlineCog6Tooth,
	HiOutlineFolder,
} from "react-icons/hi2";
import { LuGitBranch } from "react-icons/lu";
import { OpenInButton } from "renderer/components/OpenInButton";
import { trpc } from "renderer/lib/trpc";

const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}`;

export function WorkspaceSettings() {
	const { data: activeWorkspace, isLoading } =
		trpc.workspaces.getActive.useQuery();

	const { data: configFilePath } = trpc.config.getConfigFilePath.useQuery(
		{ projectId: activeWorkspace?.projectId ?? "" },
		{ enabled: !!activeWorkspace?.projectId },
	);

	if (isLoading) {
		return (
			<div className="p-6 max-w-4xl">
				<div className="animate-pulse space-y-4">
					<div className="h-8 bg-muted rounded w-1/3" />
					<div className="h-4 bg-muted rounded w-1/2" />
				</div>
			</div>
		);
	}

	if (!activeWorkspace) {
		return (
			<div className="p-6 max-w-4xl">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Workspace</h2>
					<p className="text-sm text-muted-foreground mt-1">
						No active workspace selected
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Workspace</h2>
			</div>

			<div className="space-y-6">
				<div className="space-y-2">
					<h3 className="text-sm font-medium text-muted-foreground">
						Name
					</h3>
					<p className="text-lg font-medium">{activeWorkspace.name}</p>
				</div>

				{activeWorkspace.worktree && (
					<div className="space-y-2">
						<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
							<LuGitBranch className="h-4 w-4" />
							Branch
						</h3>
						<div className="flex items-center gap-3">
							<p className="text-base font-mono">
								{activeWorkspace.worktree.branch}
							</p>
							{activeWorkspace.worktree.gitStatus?.needsRebase && (
								<span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full">
									Needs Rebase
								</span>
							)}
						</div>
					</div>
				)}

				<div className="space-y-2">
					<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
						<HiOutlineFolder className="h-4 w-4" />
						Path
					</h3>
					<p className="text-sm font-mono text-muted-foreground break-all">
						{activeWorkspace.worktreePath}
					</p>
				</div>

				{activeWorkspace.project && (
					<div className="pt-4 border-t space-y-4">
						<div className="space-y-2">
							<h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
								<HiOutlineCog6Tooth className="h-4 w-4" />
								Setup & Teardown Scripts
							</h3>
						</div>

						<div className="rounded-lg border border-border bg-card overflow-hidden">
							<div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
								<span className="text-sm text-muted-foreground font-mono truncate">
									{activeWorkspace.project.name}/.superset/config.json
								</span>
								<OpenInButton
									path={configFilePath ?? undefined}
									label="config.json"
								/>
							</div>

							<div className="p-4 bg-background/50">
								<pre className="text-sm font-mono text-foreground leading-relaxed">
									{CONFIG_TEMPLATE}
								</pre>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
