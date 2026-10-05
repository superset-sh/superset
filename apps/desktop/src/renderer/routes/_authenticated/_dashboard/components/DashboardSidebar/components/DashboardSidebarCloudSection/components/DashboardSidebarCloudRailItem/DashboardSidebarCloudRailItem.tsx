import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { ProjectThumbnail } from "renderer/routes/_authenticated/components/ProjectThumbnail";

interface DashboardSidebarCloudRailItemProps {
	workspaceId: string;
	name: string;
	repoFullName: string | null;
}

export function DashboardSidebarCloudRailItem({
	workspaceId,
	name,
	repoFullName,
}: DashboardSidebarCloudRailItemProps) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const isActive = !!matchRoute({
		to: "/v2-workspace/$workspaceId",
		params: { workspaceId },
		fuzzy: true,
	});
	const repoOwner = repoFullName?.split("/")[0];
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-label={name}
					onClick={() =>
						navigate({
							to: "/v2-workspace/$workspaceId",
							params: { workspaceId },
						})
					}
					className={cn(
						"mx-auto flex size-8 items-center justify-center rounded-md hover:bg-fill-hover",
						isActive && "bg-fill-selected",
					)}
				>
					<ProjectThumbnail
						projectName={repoFullName ?? name}
						iconUrl={repoOwner ? `https://github.com/${repoOwner}.png` : null}
						className="size-5 rounded-[5px] text-[10px]"
					/>
				</button>
			</TooltipTrigger>
			<TooltipContent side="right">{name}</TooltipContent>
		</Tooltip>
	);
}
