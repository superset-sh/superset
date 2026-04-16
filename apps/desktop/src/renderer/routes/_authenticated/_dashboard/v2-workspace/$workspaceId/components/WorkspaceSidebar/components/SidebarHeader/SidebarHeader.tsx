import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
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
		<div className="flex h-10 shrink-0 items-stretch border-b border-border">
			<div className="flex items-center h-full">
				{tabs.map((tab) => {
					const isActive = activeTab === tab.id;
					const btn = (
						<button
							type="button"
							onClick={() => onTabChange(tab.id)}
							className={getSidebarHeaderTabButtonClassName({
								isActive,
								compact,
							})}
						>
							{tab.icon && <tab.icon className="size-3.5" />}
							{!compact && tab.label}
						</button>
					);

					if (compact) {
						return (
							<Tooltip key={tab.id}>
								<TooltipTrigger asChild>{btn}</TooltipTrigger>
								<TooltipContent side="bottom" showArrow={false}>
									{tab.label}
								</TooltipContent>
							</Tooltip>
						);
					}

					return (
						<button
							key={tab.id}
							type="button"
							onClick={() => onTabChange(tab.id)}
							className={getSidebarHeaderTabButtonClassName({ isActive })}
						>
							{tab.icon && <tab.icon className="size-3.5" />}
							{tab.label}
						</button>
					);
				})}
			</div>
			<div className="flex-1" />
			{actions && (
				<div className="flex items-center h-10 pr-2 gap-0.5">{actions}</div>
			)}
		</div>
	);
}
