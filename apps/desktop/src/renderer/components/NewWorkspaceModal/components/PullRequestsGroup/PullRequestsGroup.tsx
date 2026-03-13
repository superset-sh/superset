import { Button } from "@superset/ui/button";
import { CommandEmpty, CommandGroup, CommandItem } from "@superset/ui/command";
import { toast } from "@superset/ui/sonner";
import { and, eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useNavigate } from "@tanstack/react-router";
import Fuse from "fuse.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	GoArrowUpRight,
	GoGitPullRequest,
	GoGitPullRequestDraft,
} from "react-icons/go";
import { SiGithub } from "react-icons/si";
import { GATED_FEATURES, usePaywall } from "renderer/components/Paywall";
import { useDebouncedValue } from "renderer/hooks/useDebouncedValue";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useNewWorkspaceModalDraft } from "../../NewWorkspaceModalDraftContext";

const PAGE_SIZE = 50;

interface PullRequestsGroupProps {
	projectId: string | null;
	githubOwner: string | null;
	repoName: string | null;
}

export function PullRequestsGroup({
	projectId,
	githubOwner,
	repoName,
}: PullRequestsGroupProps) {
	const collections = useCollections();
	const navigate = useNavigate();
	const { gateFeature } = usePaywall();
	const { createFromPr, draft, closeAndResetDraft, runAsyncAction } =
		useNewWorkspaceModalDraft();

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

	// Query PRs for this repository
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

	const allPrs = useMemo(
		() =>
			[...(pullRequests ?? [])].sort((a, b) => {
				if (a.state === "open" && b.state !== "open") return -1;
				if (a.state !== "open" && b.state === "open") return 1;
				const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
				const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
				return bTime - aTime;
			}),
		[pullRequests],
	);

	const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE);
	const debouncedQuery = useDebouncedValue(draft.pullRequestsQuery, 150);

	// Reset pagination when search query changes
	const [prevQuery, setPrevQuery] = useState(debouncedQuery);
	if (prevQuery !== debouncedQuery) {
		setPrevQuery(debouncedQuery);
		setDisplayLimit(PAGE_SIZE);
	}

	const prFuse = useMemo(
		() =>
			new Fuse(allPrs, {
				keys: [
					{ name: "title", weight: 2 },
					{ name: "authorLogin", weight: 1 },
					{ name: "prNumber", weight: 1 },
				],
				threshold: 0.3,
				includeScore: true,
				ignoreLocation: true,
			}),
		[allPrs],
	);

	const allMatchingPrs = useMemo(() => {
		const query = debouncedQuery.trim();
		if (!query) {
			return allPrs;
		}
		const urlMatch = allPrs.find((pr) => pr.url === query);
		if (urlMatch) return [urlMatch];
		return prFuse.search(query).map((result) => result.item);
	}, [debouncedQuery, allPrs, prFuse]);

	const visiblePrs = useMemo(
		() => allMatchingPrs.slice(0, displayLimit),
		[allMatchingPrs, displayLimit],
	);
	const hasMore = allMatchingPrs.length > displayLimit;

	// Infinite scroll: load more when sentinel is visible
	const sentinelRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					setDisplayLimit((prev) => prev + PAGE_SIZE);
				}
			},
			{ threshold: 0 },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [hasMore]);

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
							closeAndResetDraft();
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
			{visiblePrs.map((pr) => (
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
							navigateToWorkspace(existingId, navigate);
							return;
						}
						void runAsyncAction(
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
			{hasMore && (
				<div
					ref={sentinelRef}
					className="flex items-center justify-center py-2 text-xs text-muted-foreground"
				/>
			)}
		</CommandGroup>
	);
}
