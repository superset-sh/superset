import { cn } from "@superset/ui/utils";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuLoader,
	LuRefreshCw,
	LuSparkles,
} from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

const LAST_BRIEFING_KEY = "pulse-last-briefing-date";

function formatTimeAgo(timestamp: number): string {
	const diffMs = Date.now() - timestamp;
	const minutes = Math.floor(diffMs / 60000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	return `${Math.floor(hours / 24)}d ago`;
}

export function DailyBriefingSection() {
	const [collapsed, setCollapsed] = useState(false);
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const _currentUserId = session?.user?.id;

	const { data: cachedBriefing } = electronTrpc.archOne.getBriefing.useQuery();
	const generateBriefing = electronTrpc.archOne.generateBriefing.useMutation();

	const [briefing, setBriefing] = useState<{
		summary: string;
		generatedAt: number;
	} | null>(null);

	useEffect(() => {
		if (cachedBriefing) {
			setBriefing(cachedBriefing);
		}
	}, [cachedBriefing]);

	// Query recent tasks
	const { data: tasksWithStatus } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.leftJoin({ assignee: collections.users }, ({ tasks, assignee }) =>
					eq(tasks.assigneeId, assignee.id),
				)
				.select(({ tasks, status, assignee }) => ({
					...tasks,
					status,
					assignee: assignee ?? null,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	// Query recent PRs
	const { data: pullRequests } = useLiveQuery(
		(q) =>
			q
				.from({ prs: collections.githubPullRequests })
				.select(({ prs }) => ({ ...prs })),
		[collections],
	);

	const activityData = useMemo(() => {
		if (!tasksWithStatus) return null;

		const now = Date.now();
		const oneDayAgo = now - 24 * 60 * 60 * 1000;
		const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

		const completedTasks = tasksWithStatus
			.filter(
				(t) => t.completedAt && new Date(t.completedAt).getTime() > oneDayAgo,
			)
			.map((t) => ({
				slug: t.slug,
				title: t.title,
				completedBy: t.assignee?.name ?? t.assigneeDisplayName ?? "Unknown",
			}));

		const startedTasks = tasksWithStatus
			.filter(
				(t) =>
					t.status.type === "started" &&
					t.startedAt &&
					new Date(t.startedAt).getTime() > oneDayAgo,
			)
			.map((t) => ({
				slug: t.slug,
				title: t.title,
				assignee: t.assignee?.name ?? t.assigneeDisplayName ?? "Unknown",
			}));

		const newTasks = tasksWithStatus
			.filter((t) => new Date(t.createdAt).getTime() > oneDayAgo)
			.map((t) => ({ slug: t.slug, title: t.title }));

		const mergedPRs = (pullRequests ?? [])
			.filter(
				(p) =>
					p.state === "merged" &&
					p.mergedAt &&
					new Date(p.mergedAt).getTime() > oneDayAgo,
			)
			.map((p) => ({
				prNumber: p.prNumber,
				title: p.title,
				authorLogin: p.authorLogin,
			}));

		const openedPRs = (pullRequests ?? [])
			.filter(
				(p) =>
					p.state === "open" && new Date(p.createdAt).getTime() > oneDayAgo,
			)
			.map((p) => ({
				prNumber: p.prNumber,
				title: p.title,
				authorLogin: p.authorLogin,
				isDraft: p.isDraft,
			}));

		const staleTasks = tasksWithStatus
			.filter(
				(t) =>
					t.status.type === "started" &&
					new Date(t.updatedAt).getTime() < threeDaysAgo,
			)
			.map((t) => ({
				slug: t.slug,
				title: t.title,
				assignee: t.assignee?.name ?? t.assigneeDisplayName ?? "Unknown",
				daysSinceUpdate: Math.floor(
					(now - new Date(t.updatedAt).getTime()) / (24 * 60 * 60 * 1000),
				),
			}));

		// All currently open PRs — shows what teammates are actively working on
		const teamOpenPRs = (pullRequests ?? [])
			.filter((p) => p.state === "open")
			.map((p) => ({
				prNumber: p.prNumber,
				title: p.title,
				authorLogin: p.authorLogin,
				isDraft: p.isDraft,
				reviewDecision: p.reviewDecision ?? null,
				checksStatus: p.checksStatus,
				additions: p.additions,
				deletions: p.deletions,
				createdAt: new Date(p.createdAt).toISOString(),
			}));

		return {
			completedTasks,
			startedTasks,
			newTasks,
			mergedPRs,
			openedPRs,
			staleTasks,
			teamOpenPRs,
		};
	}, [tasksWithStatus, pullRequests]);

	const handleGenerate = useCallback(async () => {
		if (!activityData) return;

		try {
			const result = await generateBriefing.mutateAsync({
				activityData,
			});
			setBriefing(result);
			localStorage.setItem(LAST_BRIEFING_KEY, new Date().toDateString());
		} catch (error) {
			console.error("[DailyBriefing] Generation failed", error);
		}
	}, [activityData, generateBriefing]);

	// Auto-generate on first open of the day
	useEffect(() => {
		const lastDate = localStorage.getItem(LAST_BRIEFING_KEY);
		const today = new Date().toDateString();
		if (
			lastDate !== today &&
			activityData &&
			!briefing &&
			!generateBriefing.isPending
		) {
			handleGenerate();
		}
	}, [activityData, briefing, generateBriefing.isPending, handleGenerate]);

	const isLoading = generateBriefing.isPending;

	return (
		<div className="overflow-hidden">
			<button
				type="button"
				onClick={() => setCollapsed(!collapsed)}
				className={cn(
					"flex w-full items-center gap-1.5 px-3 py-2",
					"text-xs font-medium uppercase tracking-wider text-muted-foreground",
					"hover:bg-accent/30 cursor-pointer transition-colors",
				)}
			>
				{collapsed ? (
					<LuChevronRight className="size-3 shrink-0" />
				) : (
					<LuChevronDown className="size-3 shrink-0" />
				)}
				<LuSparkles className="size-3 shrink-0" />
				<span>Daily Briefing</span>
				<span className="flex-1" />
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						handleGenerate();
					}}
					disabled={isLoading}
					className="hover:text-foreground transition-colors p-0.5"
					title="Refresh briefing"
				>
					<LuRefreshCw className={cn("size-3", isLoading && "animate-spin")} />
				</button>
			</button>

			{!collapsed && (
				<div className="px-3 py-2 text-xs">
					{isLoading ? (
						<div className="flex items-center gap-2 text-muted-foreground py-2">
							<LuLoader className="size-3 animate-spin" />
							<span>Generating briefing...</span>
						</div>
					) : briefing ? (
						<div className="space-y-2">
							<div className="prose prose-xs prose-invert max-w-none text-xs leading-relaxed whitespace-pre-wrap">
								{briefing.summary}
							</div>
							<p className="text-[10px] text-muted-foreground">
								Generated {formatTimeAgo(briefing.generatedAt)}
							</p>
						</div>
					) : (
						<p className="text-muted-foreground py-1">
							Click refresh to generate a briefing
						</p>
					)}
				</div>
			)}
		</div>
	);
}
