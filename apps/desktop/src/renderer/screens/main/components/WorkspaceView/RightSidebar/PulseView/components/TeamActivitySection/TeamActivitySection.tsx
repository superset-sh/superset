import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import { eq, isNull } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import {
	LuChevronDown,
	LuChevronRight,
	LuGitPullRequest,
	LuUsers,
} from "react-icons/lu";
import { authClient } from "renderer/lib/auth-client";
import {
	StatusIcon,
	type StatusType,
} from "renderer/routes/_authenticated/_dashboard/tasks/components/TasksView/components/shared/StatusIcon";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

interface TeammateActivity {
	userId: string;
	name: string;
	image: string | null;
	activeIssues: Array<{
		id: string;
		slug: string;
		title: string;
		statusType: string;
		statusColor: string;
		statusProgress: number | null;
	}>;
	openPRs: Array<{
		id: string;
		title: string;
		prNumber: number;
		url: string;
		isDraft: boolean;
		reviewDecision: string | null;
	}>;
}

function ReviewBadge({ decision }: { decision: string | null }) {
	if (!decision) return null;

	const config: Record<string, { label: string; className: string }> = {
		APPROVED: {
			label: "Approved",
			className: "text-green-600 bg-green-500/10",
		},
		CHANGES_REQUESTED: {
			label: "Changes",
			className: "text-orange-600 bg-orange-500/10",
		},
		REVIEW_REQUIRED: {
			label: "Review",
			className: "text-yellow-600 bg-yellow-500/10",
		},
	};

	const c = config[decision];
	if (!c) return null;

	return (
		<span
			className={cn(
				"text-[10px] px-1 py-0.5 rounded font-medium shrink-0",
				c.className,
			)}
		>
			{c.label}
		</span>
	);
}

function TeammateRow({ teammate }: { teammate: TeammateActivity }) {
	const [expanded, setExpanded] = useState(false);
	const totalItems = teammate.activeIssues.length + teammate.openPRs.length;

	if (totalItems === 0) return null;

	return (
		<div className="overflow-hidden">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className={cn(
					"flex w-full items-center gap-2 px-3 py-1.5",
					"hover:bg-accent/30 transition-colors text-sm",
				)}
			>
				{expanded ? (
					<LuChevronDown className="size-3 shrink-0 text-muted-foreground" />
				) : (
					<LuChevronRight className="size-3 shrink-0 text-muted-foreground" />
				)}
				<Avatar size="xs" fullName={teammate.name} image={teammate.image} />
				<span className="truncate flex-1 text-left">{teammate.name}</span>
				<span className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
					{teammate.activeIssues.length > 0 && (
						<span>{teammate.activeIssues.length} issues</span>
					)}
					{teammate.openPRs.length > 0 && (
						<span className="flex items-center gap-0.5">
							<LuGitPullRequest className="size-3" />
							{teammate.openPRs.length}
						</span>
					)}
				</span>
			</button>

			{expanded && (
				<div className="pl-8 pr-3 py-1 space-y-px">
					{teammate.activeIssues.map((issue) => (
						<div
							key={issue.id}
							className="flex items-center gap-2 py-1 text-xs"
						>
							<StatusIcon
								type={issue.statusType as StatusType}
								color={issue.statusColor}
								progress={issue.statusProgress ?? undefined}
								className="size-3 shrink-0"
							/>
							<span className="text-muted-foreground shrink-0">
								{issue.slug}
							</span>
							<span className="truncate">{issue.title}</span>
						</div>
					))}
					{teammate.openPRs.map((pr) => (
						<div key={pr.id} className="flex items-center gap-2 py-1 text-xs">
							<LuGitPullRequest
								className={cn(
									"size-3 shrink-0",
									pr.isDraft ? "text-muted-foreground" : "text-green-500",
								)}
							/>
							<span className="text-muted-foreground shrink-0">
								#{pr.prNumber}
							</span>
							<span className="truncate flex-1">{pr.title}</span>
							<ReviewBadge decision={pr.reviewDecision} />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function TeamActivitySection() {
	const [collapsed, setCollapsed] = useState(false);
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;

	const { data: tasksWithStatus } = useLiveQuery(
		(q) =>
			q
				.from({ tasks: collections.tasks })
				.innerJoin({ status: collections.taskStatuses }, ({ tasks, status }) =>
					eq(tasks.statusId, status.id),
				)
				.select(({ tasks, status }) => ({
					...tasks,
					status,
				}))
				.where(({ tasks }) => isNull(tasks.deletedAt)),
		[collections],
	);

	const { data: users } = useLiveQuery(
		(q) =>
			q
				.from({ users: collections.users })
				.select(({ users }) => ({ ...users })),
		[collections],
	);

	const { data: members } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.select(({ members }) => ({ ...members })),
		[collections],
	);

	const { data: pullRequests } = useLiveQuery(
		(q) =>
			q
				.from({ prs: collections.githubPullRequests })
				.select(({ prs }) => ({ ...prs })),
		[collections],
	);

	const teammates = useMemo(() => {
		if (!users || !members || !tasksWithStatus || !currentUserId) return [];

		const orgMemberIds = new Set(members.map((m) => m.userId));

		// Build user map
		const userMap = new Map(users.map((u) => [u.id, u]));

		// Build PR lookup by authorLogin -> user (best-effort heuristic)
		const loginToUserId = new Map<string, string>();
		if (pullRequests) {
			for (const user of users) {
				// Try to match by checking if any PR authorLogin maps to this user's email prefix
				const emailPrefix = user.email.split("@")[0]?.toLowerCase();
				if (emailPrefix) {
					for (const pr of pullRequests) {
						if (pr.authorLogin.toLowerCase() === emailPrefix) {
							loginToUserId.set(pr.authorLogin.toLowerCase(), user.id);
						}
					}
				}
			}
		}

		const activityMap = new Map<string, TeammateActivity>();

		// Group active issues by assignee
		for (const task of tasksWithStatus) {
			if (
				!task.assigneeId ||
				task.assigneeId === currentUserId ||
				task.status.type === "completed" ||
				task.status.type === "canceled"
			)
				continue;
			if (!orgMemberIds.has(task.assigneeId)) continue;

			let activity = activityMap.get(task.assigneeId);
			if (!activity) {
				const user = userMap.get(task.assigneeId);
				activity = {
					userId: task.assigneeId,
					name: user?.name ?? task.assigneeDisplayName ?? "Unknown",
					image: user?.image ?? task.assigneeAvatarUrl ?? null,
					activeIssues: [],
					openPRs: [],
				};
				activityMap.set(task.assigneeId, activity);
			}
			activity.activeIssues.push({
				id: task.id,
				slug: task.slug,
				title: task.title,
				statusType: task.status.type,
				statusColor: task.status.color,
				statusProgress: task.status.progressPercent,
			});
		}

		// Group open PRs by author
		if (pullRequests) {
			for (const pr of pullRequests) {
				if (pr.state !== "open") continue;

				const userId = loginToUserId.get(pr.authorLogin.toLowerCase());
				if (!userId || userId === currentUserId) continue;
				if (!orgMemberIds.has(userId)) continue;

				let activity = activityMap.get(userId);
				if (!activity) {
					const user = userMap.get(userId);
					activity = {
						userId,
						name: user?.name ?? pr.authorLogin,
						image: user?.image ?? pr.authorAvatarUrl ?? null,
						activeIssues: [],
						openPRs: [],
					};
					activityMap.set(userId, activity);
				}
				activity.openPRs.push({
					id: pr.id,
					title: pr.title,
					prNumber: pr.prNumber,
					url: pr.url,
					isDraft: pr.isDraft,
					reviewDecision: pr.reviewDecision,
				});
			}
		}

		return Array.from(activityMap.values()).sort(
			(a, b) =>
				b.activeIssues.length +
				b.openPRs.length -
				(a.activeIssues.length + a.openPRs.length),
		);
	}, [users, members, tasksWithStatus, pullRequests, currentUserId]);

	const teammateCount = teammates.length;

	return (
		<div className="overflow-hidden border-t border-border">
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
				<LuUsers className="size-3 shrink-0" />
				<span>Team Activity</span>
				{teammateCount > 0 && (
					<span className="ml-auto text-[10px] bg-muted px-1.5 py-0.5 rounded-full tabular-nums">
						{teammateCount}
					</span>
				)}
			</button>

			{!collapsed && (
				<div className="text-sm">
					{teammates.length === 0 ? (
						<p className="px-3 py-2 text-muted-foreground text-xs">
							No team activity
						</p>
					) : (
						<div className="space-y-px">
							{teammates.map((teammate) => (
								<TeammateRow key={teammate.userId} teammate={teammate} />
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
