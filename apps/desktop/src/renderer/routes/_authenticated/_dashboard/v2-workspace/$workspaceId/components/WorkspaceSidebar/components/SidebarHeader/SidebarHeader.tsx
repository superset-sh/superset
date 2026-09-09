import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { getSidebarHeaderTabButtonClassName } from "renderer/screens/main/components/WorkspaceView/RightSidebar/headerTabStyles";
import type { SidebarTabDefinition } from "../../types";

interface SidebarHeaderProps {
	tabs: SidebarTabDefinition[];
	activeTab: string;
	onTabChange: (id: string) => void;
	compact?: boolean;
}

export function SidebarHeader({
	tabs,
	activeTab,
	onTabChange,
	compact,
}: SidebarHeaderProps) {
	const actions = tabs.find((t) => t.id === activeTab)?.actions;

	return (
		<div className="-mt-px flex h-10 shrink-0 items-stretch">
			<div className="flex min-w-0 flex-1 items-center h-full overflow-hidden">
				{tabs.map((tab, index) => {
					const isActive = activeTab === tab.id;
					const badge =
						typeof tab.badge === "number" && tab.badge > 0
							? formatBadgeCount(tab.badge)
							: null;
					const label = badge ? `${tab.label} (${badge})` : tab.label;
					const btn = (
						<button
							key={tab.id}
							type="button"
							onClick={() => onTabChange(tab.id)}
							aria-label={label}
							className={cn(
								getSidebarHeaderTabButtonClassName({
									isActive,
									compact,
									inverted: true,
								}),
								// Size by content: equal thirds truncate "Changes 99+" to
								// "Ch…" at the default width while "Files" sits on slack.
								"relative min-w-0 flex-auto justify-center",
								// The resizable panel already draws the sidebar's left edge.
								index === 0 && "border-l-transparent",
							)}
						>
							{tab.icon && <tab.icon className="size-3 shrink-0" />}
							{!compact && <span className="truncate">{tab.label}</span>}
							{badge && (
								<span
									aria-hidden="true"
									className={cn(
										"shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium leading-4 tabular-nums text-muted-foreground",
										isActive && "bg-background/80 text-foreground",
										compact &&
											"absolute right-1 top-1 min-w-3 px-1 text-[9px] leading-3",
									)}
								>
									{badge}
								</span>
							)}
						</button>
					);

					if (compact) {
						return (
							<Tooltip key={tab.id}>
								<TooltipTrigger asChild>{btn}</TooltipTrigger>
								<TooltipContent side="bottom">{label}</TooltipContent>
							</Tooltip>
						);
					}

					return btn;
				})}
			</div>
			{actions && (
				<div className="flex shrink-0 items-center h-10 pr-2 gap-0.5">
					{actions}
				</div>
			)}
		</div>
	);
}

function formatBadgeCount(count: number): string {
	return count > 99 ? "99+" : String(count);
}
