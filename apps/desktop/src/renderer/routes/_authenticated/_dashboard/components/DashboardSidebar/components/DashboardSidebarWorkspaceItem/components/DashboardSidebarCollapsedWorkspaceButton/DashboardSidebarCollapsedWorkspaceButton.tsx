import { cn } from "@superset/ui/utils";
import { type ComponentPropsWithoutRef, forwardRef } from "react";
import type { ActivePaneStatus } from "shared/tabs-types";
import type {
	DashboardSidebarWorkspaceHostType,
	DashboardSidebarWorkspacePullRequest,
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
	isCreatePending: boolean;
	pullRequestState?: DashboardSidebarWorkspacePullRequest["state"] | null;
	shortcutLabel?: string;
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
			isCreatePending,
			pullRequestState = null,
			shortcutLabel,
			className,
			...props
		},
		ref,
	) => {
		const overlayDigit = shortcutLabel?.match(/[1-9]$/)?.[0];
		return (
			<button
				type="button"
				ref={ref}
				className={cn(
					"relative flex items-center justify-center size-8 rounded-md",
					"transition-colors cursor-pointer",
					isActive
						? "bg-fill-selected hover:bg-fill-selected"
						: "hover:bg-fill-hover",
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
					isCreatePending={isCreatePending}
					pullRequestState={pullRequestState}
				/>
				{overlayDigit && (
					<span
						aria-hidden
						className="pointer-events-none absolute -right-0.5 -bottom-0.5 hidden min-w-3.5 rounded-sm bg-background px-0.5 text-center font-mono text-[9px] leading-4 text-muted-foreground tabular-nums shadow-sm group-data-[jump-shortcuts]/sidebar:flex"
					>
						{overlayDigit}
					</span>
				)}
			</button>
		);
	},
);
