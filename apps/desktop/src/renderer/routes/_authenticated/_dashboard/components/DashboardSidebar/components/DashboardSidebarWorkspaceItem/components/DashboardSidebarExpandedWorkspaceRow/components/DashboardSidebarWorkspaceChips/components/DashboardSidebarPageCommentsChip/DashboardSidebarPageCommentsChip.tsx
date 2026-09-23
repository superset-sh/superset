import { Plural } from "@lingui/react/macro";
import { Badge } from "@superset/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { LuMessageSquare } from "react-icons/lu";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

const MAX_RENDERED_COUNT = 99;

interface DashboardSidebarPageCommentsChipProps {
	count: number;
}

/**
 * Page-comment chip on the workspace activity line: how many page comments are
 * waiting on an agent in this workspace. Unlike its neighbours there is no
 * hover card — the read model behind it counts threads and cannot list them.
 */
export function DashboardSidebarPageCommentsChip({
	count,
}: DashboardSidebarPageCommentsChipProps) {
	if (count <= 0) return null;

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<Badge
					variant="secondary"
					className="h-[18px] bg-muted/60 px-1.5 py-0 text-[9px] font-medium tabular-nums text-muted-foreground [&>svg]:size-2.5"
				>
					<LuMessageSquare
						className="size-2.5 shrink-0 text-primary"
						strokeWidth={STROKE_WIDTH}
					/>
					<span aria-hidden="true" className="shrink-0">
						{count > MAX_RENDERED_COUNT ? `${MAX_RENDERED_COUNT}+` : count}
					</span>
					<span className="sr-only">
						<Plural
							value={count}
							one="# page comment is waiting on an agent here"
							other="# page comments are waiting on an agent here"
						/>
					</span>
				</Badge>
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
