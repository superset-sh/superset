import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { useMemo } from "react";
import {
	GoArrowUpRight,
	GoGitPullRequest,
	GoGitPullRequestDraft,
} from "react-icons/go";
import { SiGithub } from "react-icons/si";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import type { WorkspaceHostTarget } from "renderer/lib/v2-workspace-host";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDashboardNewWorkspaceDraft } from "../../../../DashboardNewWorkspaceDraftContext";
import { useCreateDashboardWorkspace } from "../../../../hooks/useCreateDashboardWorkspace";

interface PullRequestsGroupProps {
	projectId: string | null;
	githubRepositoryId: string | null;
	hostTarget: WorkspaceHostTarget;
}

export function PullRequestsGroup({
	projectId,
	githubRepositoryId,
	hostTarget,
}: PullRequestsGroupProps) {
	const collections = useCollections();
	const navigate = useNavigate();
	const { createWorkspace } = useCreateDashboardWorkspace();
	const { draft, closeAndResetDraft, runAsyncAction } =
		useDashboardNewWorkspaceDraft();

	// Query open PRs for this repository using the v2 project's githubRepositoryId directly
	const { data: pullRequests } = useLiveQuery(
		(q) =>
			q
				.from({ prs: collections.githubPullRequests })
				.where(({ prs }) => eq(prs.repositoryId, githubRepositoryId ?? ""))
				.select(({ prs }) => ({ ...prs })),
		[collections, githubRepositoryId],
	);

	// Check v2Workspaces for existing workspaces by branch
	const { data: v2WorkspacesData } = useLiveQuery(
		(q) =>
			q
				.from({ ws: collections.v2Workspaces })
				.where(({ ws }) => eq(ws.projectId, projectId ?? ""))
				.select(({ ws }) => ({ id: ws.id, branch: ws.branch })),
		[collections, projectId],
	);

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of v2WorkspacesData ?? []) {
			map.set(w.branch, w.id);
		}
		return map;
	}, [v2WorkspacesData]);

	const allOpenPrs = useMemo(
		() => (pullRequests ?? []).filter((pr) => pr.state === "open"),
		[pullRequests],
	);

	const debouncedQuery = useDebouncedValue(draft.pullRequestsQuery, 150);

	const prFuse = useMemo(
		() =>
			new Fuse(allOpenPrs, {
				keys: [
					{ name: "title", weight: 2 },
					{ name: "authorLogin", weight: 1 },
					{ name: "prNumber", weight: 1 },
				],
				threshold: 0.3,
				includeScore: true,
				ignoreLocation: true,
			}),
		[allOpenPrs],
	);

	const openPrs = useMemo(() => {
		const query = debouncedQuery.trim();
		if (!query) {
			return allOpenPrs.slice(0, 100);
		}
		return prFuse
			.search(query)
			.slice(0, 100)
			.map((result) => result.item);
	}, [debouncedQuery, allOpenPrs, prFuse]);

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view pull requests.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (!githubRepositoryId) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
				<SiGithub className="size-6 text-muted-foreground" />
				<div className="space-y-1">
					<p className="text-sm font-medium">No GitHub repository linked</p>
					<p className="text-xs text-muted-foreground">
						This project needs a GitHub repository to show pull requests
					</p>
				</div>
			</div>
		);
	}

	return (
		<CommandGroup>
			<CommandEmpty>No pull requests found.</CommandEmpty>
			{openPrs.map((pr) => (
				<CommandItem
					key={pr.id}
					onSelect={() => {
						if (!projectId) {
							toast.error("Select a project first");
							return;
						}
						const existingId = workspaceByBranch.get(pr.headBranch);
						if (existingId) {
							closeAndResetDraft();
							navigateToV2Workspace(existingId, navigate);
							return;
						}
						void runAsyncAction(
							createWorkspace({
								projectId,
								name: pr.title,
								branch: pr.headBranch,
								hostTarget,
							}),
							{
								loading: "Creating workspace from PR...",
								success: "Workspace created",
								error: (err) =>
									err instanceof Error
										? err.message
										: "Failed to create workspace",
							},
						);
					}}
					className="group h-12"
				>
					{workspaceByBranch.has(pr.headBranch) ? (
						<GoArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
					) : pr.isDraft ? (
						<GoGitPullRequestDraft className="size-4 shrink-0 text-muted-foreground" />
					) : (
						<GoGitPullRequest className="size-4 shrink-0 text-emerald-500" />
					)}
					<span
						className="text-muted-foreground shrink-0 text-xs tabular-nums truncate"
						style={{ width: "2.8rem" }}
					>
						#{pr.prNumber}
					</span>
					<span className="truncate flex-1">{pr.title}</span>
					<span className="text-xs text-muted-foreground shrink-0 group-data-[selected=true]:hidden">
						{pr.authorLogin}
					</span>
					<span className="text-xs text-muted-foreground shrink-0 hidden group-data-[selected=true]:inline">
						{workspaceByBranch.has(pr.headBranch) ? "Open" : "Create"} ↵
					</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}
