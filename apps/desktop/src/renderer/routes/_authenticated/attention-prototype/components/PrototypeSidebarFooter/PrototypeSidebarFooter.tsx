import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { HiOutlineCog6Tooth } from "react-icons/hi2";
import { UpdatesPill } from "renderer/components/UpdatesPill";
import { useHotkeyDisplay } from "renderer/hotkeys";
import { DashboardSidebarHelpMenu } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHelpMenu";

/**
 * The real sidebar's bottom bar (Settings + updates pill + help menu), copied
 * from DashboardSidebar's footer. Live imports: Settings really navigates,
 * the updates pill and help menu are the real components.
 */
export function PrototypeSidebarFooter({
	isCollapsed = false,
}: {
	isCollapsed?: boolean;
}) {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const settingsHotkey = useHotkeyDisplay("OPEN_SETTINGS").text;
	const isSettingsOpen = !!matchRoute({ to: "/settings", fuzzy: true });

	return (
		<div
			className={cn(
				"border-border border-t",
				isCollapsed
					? "flex flex-col items-center gap-1 py-1"
					: "flex items-center gap-1 p-3",
			)}
		>
			{isCollapsed ? (
				<Tooltip delayDuration={300}>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Settings"
							onClick={() => navigate({ to: "/settings/account" })}
							className={cn(
								"flex size-8 items-center justify-center rounded-md transition-colors",
								isSettingsOpen
									? "bg-accent text-foreground"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							<HiOutlineCog6Tooth className="size-4" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="right">Settings</TooltipContent>
				</Tooltip>
			) : (
				<button
					type="button"
					onClick={() => navigate({ to: "/settings/account" })}
					className={cn(
						"group flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm transition-colors",
						isSettingsOpen
							? "bg-accent text-foreground"
							: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
					)}
				>
					<HiOutlineCog6Tooth className="size-4 shrink-0" />
					<span className="flex-1 text-left">Settings</span>
					{settingsHotkey !== "Unassigned" && (
						<span
							className={cn(
								"shrink-0 font-mono text-[10px] text-muted-foreground/60 tabular-nums",
								"opacity-0 transition-opacity group-focus-visible:opacity-100 group-hover:opacity-100",
							)}
						>
							{settingsHotkey}
						</span>
					)}
				</button>
			)}

			<UpdatesPill isCollapsed={isCollapsed} />
			<DashboardSidebarHelpMenu isCollapsed={isCollapsed} />
		</div>
	);
}
