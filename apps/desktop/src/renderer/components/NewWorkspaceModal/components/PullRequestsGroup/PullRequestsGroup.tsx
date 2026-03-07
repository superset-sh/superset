import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	GoArrowUpRight,
	GoGitPullRequest,
	GoGitPullRequestDraft,
} from "react-icons/go";
import { SiGithub } from "react-icons/si";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCreateFromPr } from "renderer/react-query/workspaces/useCreateFromPr";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface PullRequestsGroupProps {
	projectId: string | null;
	githubOwner: string | null;
	repoName: string | null;
	onClose: () => void;
}

export function PullRequestsGroup({
	projectId,
	githubOwner,
	repoName,
	onClose,
}: PullRequestsGroupProps) {
	const collections = useCollections();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const createFromPr = useCreateFromPr();

	// Match GitHub repository by owner + name from the local project
	const { data: repoData } = useLiveQuery(
		(q) =>
			q
				.from({ repos: collections.githubRepositories })
				.where(({ repos }) =>
					and(
						eq(repos.owner, githubOwner ?? ""),
						eq(repos.name, repoName ?? ""),
					),
				)
				.select(({ repos }) => ({
					id: repos.id,
				})),
		[collections, githubOwner, repoName],
	);

	const githubRepositoryId = repoData?.[0]?.id ?? null;

	// Query open PRs for this repository
	const { data: pullRequests } = useLiveQuery(
		(q) =>
			q
				.from({ prs: collections.githubPullRequests })
				.where(({ prs }) => eq(prs.repositoryId, githubRepositoryId ?? ""))
				.select(({ prs }) => ({ ...prs })),
		[collections, githubRepositoryId],
	);

	const { data: allWorkspaces = [] } =
		electronTrpc.workspaces.getAll.useQuery();

	const workspaceByBranch = useMemo(() => {
		const map = new Map<string, string>();
		for (const w of allWorkspaces) {
			if (w.projectId === projectId) {
				map.set(w.branch, w.id);
			}
		}
		return map;
	}, [allWorkspaces, projectId]);

	const openPrs = useMemo(
		() => (pullRequests ?? []).filter((pr) => pr.state === "open").slice(0, 30),
		[pullRequests],
	);

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view pull requests.</CommandEmpty>
			</CommandGroup>
		);
	}

	if (!githubOwner) {
		return (
			<div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
				<SiGithub className="size-6 text-muted-foreground" />
				<div className="space-y-1">
					<p className="text-sm font-medium">Connect GitHub</p>
					<p className="text-xs text-muted-foreground">
						Sync pull requests from GitHub to create workspaces
					</p>
				</div>
				<Button
					size="sm"
					variant="outline"
					onClick={() => {
						gateFeature(GATED_FEATURES.INTEGRATIONS, () => {
							onClose();
							navigate({ to: "/settings/integrations" });
						});
					}}
				>
					Connect
				</Button>
			</div>
		);
	}

	if (!githubRepositoryId) {
		return (
			<CommandGroup>
				<CommandEmpty>No GitHub repository found.</CommandEmpty>
			</CommandGroup>
		);
	}

	return (
		<CommandGroup>
			<CommandEmpty>No pull requests found.</CommandEmpty>
			{openPrs.map((pr) => (
				<CommandItem
					key={pr.id}
					value={`#${pr.prNumber} ${pr.title} ${pr.authorLogin} ${pr.url}`}
					onSelect={() => {
						if (!projectId) {
							toast.error("Select a project first");
							return;
						}
						const existingId = workspaceByBranch.get(pr.headBranch);
						if (existingId) {
							onClose();
							navigateToWorkspace(existingId, navigate);
							return;
						}
						onClose();
						toast.promise(
							createFromPr.mutateAsync({
								projectId,
								prUrl: pr.url,
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
