import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { HiExclamationTriangle } from "react-icons/hi2";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface DashboardSidebarPendingProjectRowProps {
	projectName: string;
	githubOwner: string | null;
	status: "not_setup" | "path_missing";
	isCollapsed: boolean;
	onClick: () => void;
}

const STATUS_LABEL: Record<
	DashboardSidebarPendingProjectRowProps["status"],
	string
> = {
	not_setup: "Set up",
	path_missing: "Path missing",
};

export function DashboardSidebarPendingProjectRow({
	projectName,
	githubOwner,
	status,
	isCollapsed,
	onClick,
}: DashboardSidebarPendingProjectRowProps) {
	if (isCollapsed) {
		return (
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={onClick}
						className="relative flex h-10 w-full items-center justify-center hover:bg-muted/50 transition-colors"
						aria-label={`${projectName} — ${STATUS_LABEL[status]}`}
					>
						<ProjectThumbnail
							projectName={projectName}
							githubOwner={githubOwner}
							className="size-4 opacity-60"
						/>
						<HiExclamationTriangle className="absolute bottom-1 right-1 size-3 text-amber-500" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="right">
					{projectName} — {STATUS_LABEL[status]}
				</TooltipContent>
			</Tooltip>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"group flex min-h-10 w-full items-center pl-3 pr-2 py-1.5 text-sm font-medium",
				"hover:bg-muted/50 transition-colors text-left",
			)}
		>
			<div className="flex min-w-0 flex-1 items-center gap-2 py-0.5">
				<div className="shrink-0 size-5 flex items-center justify-center">
					<ProjectThumbnail
						projectName={projectName}
						githubOwner={githubOwner}
						className="size-4 opacity-60"
					/>
				</div>
				<span className="truncate text-muted-foreground">{projectName}</span>
			</div>
			<span className="shrink-0 flex items-center gap-1 text-xs text-amber-500">
				<HiExclamationTriangle className="size-3.5" />
				{STATUS_LABEL[status]}
			</span>
		</button>
	);
}
