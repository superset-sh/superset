import { BriefcaseBusiness } from "lucide-react";

interface DashboardWorkSidebarProps {
	isCollapsed: boolean;
}

export function DashboardWorkSidebar({
	isCollapsed,
}: DashboardWorkSidebarProps) {
	if (isCollapsed) {
		return <div className="flex-1" />;
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col px-3 py-3">
			<div className="rounded-md border border-border/70 bg-background/70 px-3 py-3">
				<div className="flex items-center gap-2 text-sm font-medium text-foreground">
					<BriefcaseBusiness className="size-4" />
					<span>Work</span>
				</div>
				<div className="mt-2 text-xs text-muted-foreground">
					Reserved for multi-agent collaboration.
				</div>
			</div>
		</div>
	);
}
