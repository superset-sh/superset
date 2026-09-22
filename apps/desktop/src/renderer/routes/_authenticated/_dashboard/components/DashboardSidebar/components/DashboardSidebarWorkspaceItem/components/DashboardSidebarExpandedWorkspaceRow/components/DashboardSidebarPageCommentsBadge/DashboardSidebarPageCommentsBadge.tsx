import { Plural } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";

const MAX_RENDERED_COUNT = 99;

interface DashboardSidebarPageCommentsBadgeProps {
	count: number;
}

export function DashboardSidebarPageCommentsBadge({
	count,
}: DashboardSidebarPageCommentsBadgeProps) {
	if (count <= 0) return null;

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 px-1 font-medium text-[9px] text-primary tabular-nums">
					<span aria-hidden="true">
						{count > MAX_RENDERED_COUNT ? `${MAX_RENDERED_COUNT}+` : count}
					</span>
					<span className="sr-only">
						<Plural
							value={count}
							one="# page comment is waiting on an agent here"
							other="# page comments are waiting on an agent here"
						/>
					</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="right">
				<Plural
					value={count}
					one="# page comment is waiting on an agent here"
					other="# page comments are waiting on an agent here"
				/>
			</TooltipContent>
		</Tooltip>
	);
}
