import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import type { ActivePaneStatus } from "shared/tabs-types";
import type { DashboardSidebarWorkspaceHostType } from "../../../../types";
import { DashboardSidebarWorkspaceIcon } from "../DashboardSidebarWorkspaceIcon";

interface DashboardSidebarCollapsedWorkspaceButtonProps
	extends ComponentPropsWithoutRef<"button"> {
	hostType: DashboardSidebarWorkspaceHostType;
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
					"hover:bg-muted/50 transition-colors cursor-pointer",
					isActive && "bg-muted",
					className,
				)}
				{...props}
			>
				<DashboardSidebarWorkspaceIcon
					hostType={hostType}
					isActive={isActive}
					variant="collapsed"
					workspaceStatus={workspaceStatus}
					creationStatus={creationStatus}
				/>
			</button>
		);
	},
);
