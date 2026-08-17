import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@superset/ui/hover-card";
import { V2WorkspacePrHoverCardContent } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/V2WorkspacePrHoverCardContent";
import { WorkspaceChecksDot } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/components/WorkspaceChecksDot";
import type { V2WorkspacePrSummary } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import { PRIcon } from "renderer/screens/main/components/PRIcon/PRIcon";

interface WorkspacePrPillProps {
	pr: V2WorkspacePrSummary;
	branch: string;
}

/** Compact PR chip: state icon, number, and checks indicator; details on hover. */
export function WorkspacePrPill({ pr, branch }: WorkspacePrPillProps) {
	return (
		<HoverCard openDelay={200} closeDelay={120}>
			<HoverCardTrigger asChild>
				<a
					href={pr.url}
					target="_blank"
					rel="noreferrer"
					onClick={(event) => event.stopPropagation()}
					aria-label={`Pull request #${pr.prNumber}, ${pr.state}${pr.checksStatus !== "none" ? `, checks ${pr.checksStatus}` : ""}`}
					className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
				>
					<PRIcon state={pr.state} className="size-3" />
					<span className="tabular-nums">#{pr.prNumber}</span>
					<WorkspaceChecksDot status={pr.checksStatus} checks={pr.checks} />
				</a>
			</HoverCardTrigger>
			<HoverCardContent
				side="top"
				align="start"
				className="w-80 p-3"
				onClick={(event) => event.stopPropagation()}
			>
				<V2WorkspacePrHoverCardContent pr={pr} branch={branch} />
			</HoverCardContent>
		</HoverCard>
	);
}
