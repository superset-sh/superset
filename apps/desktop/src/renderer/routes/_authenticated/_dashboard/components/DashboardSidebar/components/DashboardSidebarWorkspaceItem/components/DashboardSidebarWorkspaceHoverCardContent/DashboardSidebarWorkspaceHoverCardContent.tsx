import { Button } from "@superset/ui/button";
import { LuExternalLink, LuGitBranch } from "react-icons/lu";
import type { DashboardSidebarWorkspacePullRequest } from "../../../../types";
import type { WorkspaceRowMockData } from "../../utils";
import { DashboardSidebarWorkspaceStatusBadge } from "../DashboardSidebarWorkspaceStatusBadge";

interface DashboardSidebarWorkspaceHoverCardContentProps {
	name: string;
	branch: string;
	mockData: WorkspaceRowMockData;
	pullRequest: DashboardSidebarWorkspacePullRequest | null;
}

export function DashboardSidebarWorkspaceHoverCardContent({
	name,
	branch,
	mockData,
	pullRequest,
}: DashboardSidebarWorkspaceHoverCardContentProps) {
	return (
		<div className="space-y-3">
			<div className="space-y-1.5">
				<div className="text-sm font-medium">{name || branch}</div>
				<div className="space-y-0.5">
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						Branch
					</span>
					<div className="flex items-center gap-1 break-all font-mono text-sm">
						{branch}
						<LuExternalLink className="size-3 shrink-0 text-muted-foreground" />
					</div>
				</div>
				<span className="block text-xs text-muted-foreground">
					Updated a few minutes ago
				</span>
			</div>

			{pullRequest ? (
				<div className="space-y-2 border-t border-border pt-2">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-1.5">
							<DashboardSidebarWorkspaceStatusBadge
								state={pullRequest.state}
								prNumber={pullRequest.number}
							/>
						</div>
						<div className="flex items-center gap-2 text-xs font-mono">
							<span className="text-emerald-500">
								+{mockData.diffStats.additions}
							</span>
							<span className="text-red-400">
								-{mockData.diffStats.deletions}
							</span>
						</div>
					</div>
					<p className="text-xs leading-relaxed">{pullRequest.title}</p>
					<div className="text-xs text-muted-foreground">
						{getChecksStatusLabel(pullRequest.checksStatus)}
					</div>
					<div className="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							className="h-7 flex-1 gap-1.5 text-xs"
							onClick={() => window.open(pullRequest.url, "_blank")}
						>
							<LuGitBranch className="size-3" />
							Open pull request
						</Button>
					</div>
				</div>
			) : null}
		</div>
	);
}

function getChecksStatusLabel(
	checksStatus: DashboardSidebarWorkspacePullRequest["checksStatus"],
): string {
	switch (checksStatus) {
		case "success":
			return "All checks passing";
		case "failure":
			return "Checks failing";
		case "pending":
			return "Checks still running";
		default:
			return "No checks reported";
	}
}
