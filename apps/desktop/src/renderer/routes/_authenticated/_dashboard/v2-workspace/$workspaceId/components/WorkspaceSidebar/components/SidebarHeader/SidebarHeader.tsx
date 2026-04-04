import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface Tab {
	id: string;
	label: string;
	icon?: ReactNode;
	badge?: number;
}

interface SidebarHeaderProps {
	tabs: Tab[];
	activeTab: string;
	onTabChange: (id: string) => void;
	actions?: ReactNode;
}

export function SidebarHeader({
	tabs,
	activeTab,
	onTabChange,
	actions,
}: SidebarHeaderProps) {
	return (
		<div className="flex h-10 shrink-0 items-stretch border-b border-border">
			<div className="flex flex-1 items-stretch">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						type="button"
						onClick={() => onTabChange(tab.id)}
						className={cn(
							"flex h-full shrink-0 items-center gap-2 px-3 text-sm transition-all",
							activeTab === tab.id
								? "bg-border/30 text-foreground"
								: "text-muted-foreground/70 hover:text-muted-foreground hover:bg-tertiary/20",
						)}
					>
						{tab.icon}
						{tab.label}
						{tab.badge != null && tab.badge > 0 && (
							<span className="text-xs tabular-nums">{tab.badge}</span>
						)}
					</button>
				))}
			</div>
			{actions && (
				<div className="flex items-center gap-0.5 px-1">{actions}</div>
			)}
		</div>
	);
}
