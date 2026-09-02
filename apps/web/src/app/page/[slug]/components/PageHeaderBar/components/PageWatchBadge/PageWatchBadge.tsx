"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";

const WATCHING_REFRESH_MS = 30_000;
const IDLE_REFRESH_MS = 5 * 60_000;

interface PageWatchBadgeProps {
	slug: string;
	initialWatching: boolean;
	initialAgentId: string | null;
}

export function PageWatchBadge({
	slug,
	initialWatching,
	initialAgentId,
}: PageWatchBadgeProps) {
	const trpc = useTRPC();
	const { data } = useQuery({
		...trpc.page.get.queryOptions({ slug }),
		refetchInterval: (query) =>
			(query.state.data?.watch.watching ?? initialWatching)
				? WATCHING_REFRESH_MS
				: IDLE_REFRESH_MS,
		refetchIntervalInBackground: false,
	});

	const watch = data?.watch ?? {
		watching: initialWatching,
		agentId: initialAgentId,
	};

	if (!watch.watching) return null;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
					<span className="relative flex size-1.5">
						<span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
						<span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
					</span>
					<span className="hidden sm:inline">
						{watch.agentId
							? `${watch.agentId} is watching`
							: "An agent is watching"}
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="bottom">
				New comments on this page are sent to the agent as you leave them.
			</TooltipContent>
		</Tooltip>
	);
}
