import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { useState } from "react";
import { LuRadioTower } from "react-icons/lu";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { useDashboardSidebarAllPorts } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/providers/DashboardSidebarPortsProvider";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";
import { usePortsDisplayMode } from "renderer/stores/inline-workspace-ports";
import { TopBarPortsFooter } from "./components/TopBarPortsFooter";
import { TopBarPortsGroup } from "./components/TopBarPortsGroup";

/**
 * Top-bar entry point for the "topbar" ports layout: a compact pill showing
 * the live port count, opening a dropdown that lists every detected port
 * across all visible workspaces and hosts.
 *
 * Also mounted in the v2 workspace tab bar's trailing slot, which replaces
 * the top bar on that route. Port data comes from the
 * DashboardSidebarPortsProvider instance in the dashboard layout — this
 * component remounts on workspace navigation, so it must not own the data
 * (the first empty-data frames would blink the pill out on every remount).
 */
interface TopBarPortsDropdownProps {
	align?: "start" | "end";
}

export function TopBarPortsDropdown({
	align = "end",
}: TopBarPortsDropdownProps) {
	const { t } = useLingui();
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const portsDisplayMode = usePortsDisplayMode();
	const [open, setOpen] = useState(false);
	const { workspacePortGroups, totalPortCount } = useDashboardSidebarAllPorts();

	if (
		!isV2CloudEnabled ||
		portsDisplayMode !== "topbar" ||
		totalPortCount === 0
	) {
		return null;
	}

	const workspaceCount = workspacePortGroups.length;

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip delayDuration={300}>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={t({
								message: `Ports — ${totalPortCount} live`,
							})}
							className="flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-fill-hover hover:text-foreground data-[state=open]:bg-fill-hover data-[state=open]:text-foreground"
						>
							<LuRadioTower className="size-3.5" strokeWidth={STROKE_WIDTH} />
							<span className="font-medium tabular-nums">{totalPortCount}</span>
						</button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					<p className="text-xs">
						<Trans>
							<Plural value={totalPortCount} one="# port" other="# ports" />{" "}
							across{" "}
							<Plural
								value={workspaceCount}
								one="# workspace"
								other="# workspaces"
							/>
						</Trans>
					</p>
				</TooltipContent>
			</Tooltip>
			<PopoverContent align={align} sideOffset={6} className="w-80 p-0">
				<div className="flex items-center gap-1.5 border-border border-b px-3 py-2">
					<LuRadioTower
						className="size-3 text-muted-foreground"
						strokeWidth={STROKE_WIDTH}
					/>
					<span className="font-medium text-foreground text-xs">
						<Trans>Ports</Trans>
					</span>
				</div>
				<div className="max-h-80 overflow-y-auto p-1">
					{workspacePortGroups.map((group) => (
						<TopBarPortsGroup
							key={group.workspaceId}
							group={group}
							onNavigate={() => setOpen(false)}
						/>
					))}
				</div>
				<TopBarPortsFooter
					groups={workspacePortGroups}
					totalPortCount={totalPortCount}
				/>
			</PopoverContent>
		</Popover>
	);
}
