import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { toast } from "@superset/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
	LuCircle,
	LuCircleCheck,
	LuExternalLink,
	LuLoaderCircle,
	LuRefreshCw,
	LuSlack,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

type SlackChannel =
	RouterOutputs["customers"]["domainSlackTasks"]["channels"][number];

type SlackTask = NonNullable<SlackChannel["store"]>["tasks"][number];

function taskPermalink(task: SlackTask, permalinkBase: string): string | null {
	if (!task.sourceTs) return null;
	return `${permalinkBase}/p${task.sourceTs.replace(".", "")}`;
}

function TaskRow({
	task,
	permalinkBase,
}: {
	task: SlackTask;
	permalinkBase: string;
}) {
	const link = taskPermalink(task, permalinkBase);
	const done = task.status === "done";
	return (
		<li className="flex items-start gap-2 text-sm">
			{done ? (
				<LuCircleCheck className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
			) : (
				<LuCircle className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
			)}
			<span className={done ? "text-muted-foreground line-through" : ""}>
				{task.title}
				{task.owner && (
					<Badge
						variant="outline"
						className={
							task.owner === "us" && !done
								? "ml-2 border-sky-500/40 text-sky-400"
								: "ml-2"
						}
					>
						{task.owner === "us" ? "on us" : "on them"}
					</Badge>
				)}
				{task.assignee && (
					<span className="text-muted-foreground ml-2 text-xs">
						{task.assignee}
					</span>
				)}
				{link && (
					<a
						href={link}
						target="_blank"
						rel="noreferrer"
						className="text-muted-foreground hover:text-foreground ml-1.5 inline-flex align-middle"
						title="Open in Slack"
					>
						<LuExternalLink className="size-3" />
					</a>
				)}
			</span>
		</li>
	);
}

function ChannelSection({ channel }: { channel: SlackChannel }) {
	const store = channel.store;
	const open = store?.tasks.filter((task) => task.status === "open") ?? [];
	const done = store?.tasks.filter((task) => task.status === "done") ?? [];
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<span className="font-medium">#{channel.name}</span>
				{channel.matchedBy === "name" && (
					<Badge
						variant="outline"
						title="Matched by channel name — add a customer:<domain> tag to the topic to make it explicit"
					>
						name match
					</Badge>
				)}
				{!channel.isMember && (
					<Badge
						className="border-transparent bg-amber-500/15 text-amber-400"
						title="Slack only exposes history for channels the token's user has joined"
					>
						join channel to sync
					</Badge>
				)}
				{store && (
					<span className="text-muted-foreground text-xs">
						synced{" "}
						{formatDistanceToNow(new Date(store.syncedAt), {
							addSuffix: true,
						})}
					</span>
				)}
			</div>
			{store ? (
				store.tasks.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No tasks found in this conversation yet.
					</p>
				) : (
					<ul className="space-y-1.5">
						{open.map((task) => (
							<TaskRow
								key={task.id}
								task={task}
								permalinkBase={store.permalinkBase}
							/>
						))}
						{done.map((task) => (
							<TaskRow
								key={task.id}
								task={task}
								permalinkBase={store.permalinkBase}
							/>
						))}
					</ul>
				)
			) : channel.isMember ? (
				<p className="text-muted-foreground text-sm">
					Not synced yet — hit Sync to read the conversation and extract tasks.
				</p>
			) : null}
		</div>
	);
}

export interface SlackTasksCardProps {
	domain: string;
}

/**
 * Tasks extracted from our Slack channels with this customer. Cached task
 * lists always render; Sync reads new messages and has Claude update the list.
 * Renders nothing when SLACK_CUSTOMERS_TOKEN isn't configured.
 */
export function SlackTasksCard({ domain }: SlackTasksCardProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const slackTasks = useQuery(
		trpc.customers.domainSlackTasks.queryOptions(
			{ domain },
			{ staleTime: 60_000, retry: false },
		),
	);

	const sync = useMutation(
		trpc.customers.syncDomainSlackTasks.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: trpc.customers.domainSlackTasks.queryKey({ domain }),
				});
				if (result.failures.length > 0) {
					toast.error(`Sync failed for ${result.failures.join(", ")}`);
				} else {
					toast.success(
						`Synced ${result.synced} channel${result.synced === 1 ? "" : "s"}`,
					);
				}
			},
			onError: (error) => toast.error(`Slack sync failed: ${error.message}`),
		}),
	);

	const data = slackTasks.data;
	if (!data || !data.configured) return null;

	const openCount = data.channels.reduce(
		(count, channel) =>
			count +
			(channel.store?.tasks.filter((task) => task.status === "open").length ??
				0),
		0,
	);
	const hasJoinedChannel = data.channels.some((channel) => channel.isMember);

	return (
		<Card>
			<CardHeader className="flex flex-row items-start justify-between space-y-0">
				<div className="space-y-1.5">
					<CardTitle className="flex items-center gap-2">
						<LuSlack className="text-muted-foreground size-4" />
						Slack
						{openCount > 0 && <Badge>{openCount} open</Badge>}
					</CardTitle>
					<CardDescription>
						Tasks extracted from shared channels with this customer
					</CardDescription>
				</div>
				{hasJoinedChannel && (
					<Button
						variant="outline"
						size="sm"
						disabled={sync.isPending}
						onClick={() => sync.mutate({ domain })}
					>
						{sync.isPending ? (
							<LuLoaderCircle className="animate-spin" />
						) : (
							<LuRefreshCw />
						)}
						{sync.isPending ? "Syncing…" : "Sync"}
					</Button>
				)}
			</CardHeader>
			<CardContent className="space-y-5">
				{data.channels.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No Slack channels matched. Add{" "}
						<code className="bg-muted rounded px-1 py-0.5 text-xs">
							customer:{domain}
						</code>{" "}
						to a channel topic, or name the channel{" "}
						<code className="bg-muted rounded px-1 py-0.5 text-xs">
							ext-{domain.split(".")[0]}
						</code>
						.
					</p>
				) : (
					data.channels.map((channel) => (
						<ChannelSection key={channel.channelId} channel={channel} />
					))
				)}
			</CardContent>
		</Card>
	);
}
