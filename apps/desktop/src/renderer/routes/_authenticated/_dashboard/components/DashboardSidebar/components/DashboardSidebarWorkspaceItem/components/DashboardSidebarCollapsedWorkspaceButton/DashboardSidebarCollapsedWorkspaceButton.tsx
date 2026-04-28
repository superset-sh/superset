import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspaceHostType,
	DashboardSidebarWorkspaceType,
} from "../../../../types";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";

interface DashboardSidebarCollapsedWorkspaceButtonProps
	extends ComponentPropsWithoutRef<"button"> {
	hostType: DashboardSidebarWorkspaceHostType;
	workspaceType: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean | null;
	isActive: boolean;
	workspaceStatus?: ActivePaneStatus | null;
	creationStatus?: "preparing" | "generating-branch" | "creating" | "failed";
}

export const DashboardSidebarCollapsedWorkspaceButton = forwardRef<
	HTMLButtonElement,
	DashboardSidebarCollapsedWorkspaceButtonProps
>(
	(
		{
			hostType,
			workspaceType,
			hostIsOnline,
			isActive,
			workspaceStatus = null,
			creationStatus,
			className,
			...props
		},
		ref,
	) => {
		return (
			<button
				type="button"
				ref={ref}
				className={cn(
					"relative flex items-center justify-center size-8 rounded-md",
					"transition-colors cursor-pointer",
					isActive ? "bg-muted hover:bg-muted" : "hover:bg-muted/50",
					className,
				)}
				{...props}
			>
				<DashboardSidebarWorkspaceIcon
					hostType={hostType}
					workspaceType={workspaceType}
					hostIsOnline={hostIsOnline}
					isActive={isActive}
					variant="collapsed"
					workspaceStatus={workspaceStatus}
					creationStatus={creationStatus}
				/>
			</button>
		);
	},
);
