import { OverflowFadeText } from "@superset/ui/overflow-fade-text";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { ChevronRight, GitBranch } from "lucide-react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useWorkspaceCreatesStore } from "renderer/stores/workspace-creates";

interface V2WorkspaceTitleProps {
	workspaceId: string;
}

export function V2WorkspaceTitle({ workspaceId }: V2WorkspaceTitleProps) {
	const collections = useCollections();
	const { data: workspaces = [] } = useLiveQuery(
		(q) =>
			q
				.from({ workspaces: collections.v2Workspaces })
				.where(({ workspaces }) => eq(workspaces.id, workspaceId))
				.select(({ workspaces }) => ({
					name: workspaces.name,
					branch: workspaces.branch,
				})),
		[collections, workspaceId],
	);
	const syncedWorkspace = workspaces[0] ?? null;
	const inFlight = useWorkspaceCreatesStore((store) =>
		store.entries.find((entry) => entry.snapshot.id === workspaceId),
	);
	const name =
		syncedWorkspace?.name ??
		inFlight?.cloudRow?.name ??
		inFlight?.snapshot.name ??
		null;
	const branch =
		syncedWorkspace?.branch ??
		inFlight?.cloudRow?.branch ??
		inFlight?.snapshot.branch ??
		null;

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
