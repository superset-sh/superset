import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import { ChevronRight, GitBranch } from "lucide-react";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";

interface V2WorkspaceTitleProps {
	workspaceId: string;
}

export function V2WorkspaceTitle({ workspaceId }: V2WorkspaceTitleProps) {
	const { workspaces } = useHostWorkspaces();
	const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;
	const name = workspace ? getV2WorkspaceDisplayName(workspace) || null : null;
	const rawBranch = workspace?.branch ?? null;
	// The display name falls back to the branch for unnamed worktrees; don't
	// render the same text twice.
	const branch = rawBranch === name ? null : rawBranch;

	if (!name && !branch) {
		return null;
	}

	return (
		<div className="flex min-w-0 max-w-full items-center gap-1.5 text-[13px] tracking-tight">
			{name && (
				<OverflowFadeText className="font-medium text-foreground" title={name}>
					{name}
				</OverflowFadeText>
			)}
			{name && branch && (
				<ChevronRight
					className="size-3 shrink-0 text-muted-foreground/40"
					strokeWidth={2}
					aria-hidden="true"
				/>
			)}
			{branch && (
				<span
					className="flex min-w-0 items-center gap-1 text-muted-foreground"
					title={branch}
				>
					<GitBranch
						className="size-3 shrink-0 opacity-70"
						strokeWidth={2}
						aria-hidden="true"
					/>
					<OverflowFadeText>{branch}</OverflowFadeText>
				</span>
			)}
		</div>
	);
}
