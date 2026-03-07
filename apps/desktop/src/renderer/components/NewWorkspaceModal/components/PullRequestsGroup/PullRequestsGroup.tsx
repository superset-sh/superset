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
import {
	getGitHubRepoRef,
	parseGitHubPrUrl,
	toCanonicalGitHubPrUrl,
} from "shared/utils/github-repo";

interface PullRequestsGroupProps {
	projectId: string | null;
	githubOwner: string | null;
	githubRepoName: string | null;
	mainRepoPath: string | null;
	searchQuery: string;
	onClose: () => void;
}

export function PullRequestsGroup({
	projectId,
	githubOwner,
	githubRepoName,
	mainRepoPath,
	searchQuery,
	onClose,
}: PullRequestsGroupProps) {
	const collections = useCollections();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const createFromPr = useCreateFromPr();
	const repoRef = useMemo(
		() => getGitHubRepoRef({ githubOwner, githubRepoName, mainRepoPath }),
		[githubOwner, githubRepoName, mainRepoPath],
	);

	// Match GitHub repository by owner + name from the local project
	const { data: repoData } = useLiveQuery(
		(q) =>
			q
				.from({ repos: collections.githubRepositories })
				.where(({ repos }) =>
					and(
						eq(repos.owner, repoRef?.owner ?? ""),
						eq(repos.name, repoRef?.repoName ?? ""),
					),
				)
				.select(({ repos }) => ({
					id: repos.id,
				})),
		[collections, repoRef],
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

	const allOpenPrs = useMemo(
		() =>
			[...(pullRequests ?? [])]
				.filter((pr) => pr.state === "open")
				.sort((a, b) => {
					const aUpdated =
						a.updatedAt instanceof Date
							? a.updatedAt.getTime()
							: new Date(a.updatedAt).getTime();
					const bUpdated =
						b.updatedAt instanceof Date
							? b.updatedAt.getTime()
							: new Date(b.updatedAt).getTime();
					return bUpdated - aUpdated;
				}),
		[pullRequests],
	);
	const hasSearchQuery = searchQuery.trim().length > 0;
	const openPrs = useMemo(
		() => (hasSearchQuery ? allOpenPrs : allOpenPrs.slice(0, 30)),
		[allOpenPrs, hasSearchQuery],
	);
	const manualPr = useMemo(() => parseGitHubPrUrl(searchQuery), [searchQuery]);
	const manualPrUrl = useMemo(
		() => toCanonicalGitHubPrUrl(manualPr),
		[manualPr],
	);
	const hasSyncedManualMatch = useMemo(() => {
		if (!manualPrUrl) {
			return false;
		}

		return allOpenPrs.some((pr) => {
			const parsedUrl = parseGitHubPrUrl(pr.url);
			return toCanonicalGitHubPrUrl(parsedUrl) === manualPrUrl;
		});
	}, [allOpenPrs, manualPrUrl]);
	const showManualPrOption =
		Boolean(projectId) && Boolean(manualPrUrl) && !hasSyncedManualMatch;

	if (!projectId) {
		return (
			<CommandGroup>
				<CommandEmpty>Select a project to view pull requests.</CommandEmpty>
			</CommandGroup>
		);
	}

	const manualPrItem = showManualPrOption ? (
		<CommandGroup heading="From URL">
			<CommandItem
				value={`${manualPrUrl} create from url`}
				onSelect={() => {
					if (!projectId || !manualPrUrl) {
						toast.error("Select a project first");
						return;
					}
					onClose();
					toast.promise(
						createFromPr.mutateAsync({
							projectId,
							prUrl: manualPrUrl,
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
			>
				<GoGitPullRequest className="size-4 shrink-0 text-emerald-500" />
				<span className="truncate flex-1">
					{manualPr
						? `${manualPr.owner}/${manualPr.repo} #${manualPr.number}`
						: manualPrUrl}
				</span>
				<span className="text-xs text-muted-foreground shrink-0 group-data-[selected=true]:hidden">
					Create from URL
				</span>
				<span className="text-xs text-muted-foreground shrink-0 hidden group-data-[selected=true]:inline">
					Create ↵
				</span>
			</CommandItem>
		</CommandGroup>
	) : null;

	if (!githubOwner) {
		return (
			<>
				{manualPrItem}
				<div className="flex flex-col items-center gap-3 py-8 px-4 text-center">
					<SiGithub className="size-6 text-muted-foreground" />
					<div className="space-y-1">
						<p className="text-sm font-medium">Connect GitHub</p>
						<p className="text-xs text-muted-foreground">
							Sync pull requests from GitHub or paste a PR URL to create a
							workspace
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
			</>
		);
	}

	if (!githubRepositoryId) {
		return (
			<>
				{manualPrItem}
				<CommandGroup>
					<CommandEmpty>
						No synced GitHub repository found. Paste a PR URL to create a
						workspace anyway.
					</CommandEmpty>
				</CommandGroup>
			</>
		);
	}

	return (
		<>
			{manualPrItem}
			<CommandGroup>
				<CommandEmpty>
					{searchQuery.trim()
						? "No matching pull requests found."
						: "No pull requests found."}
				</CommandEmpty>
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
		</>
	);
}
