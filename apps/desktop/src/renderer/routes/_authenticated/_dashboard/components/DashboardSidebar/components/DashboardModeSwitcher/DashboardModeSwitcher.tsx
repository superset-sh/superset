import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { BriefcaseBusiness, Code2, MessageSquare } from "lucide-react";
import type { DashboardMode } from "../../utils/dashboardMode";

interface DashboardModeSwitcherProps {
	mode: DashboardMode;
	isCollapsed: boolean;
	onModeChange: (mode: DashboardMode) => void;
}

const MODES = [
	{ id: "chat", label: "Chat", icon: MessageSquare },
	{ id: "code", label: "Code", icon: Code2 },
	{ id: "work", label: "Work", icon: BriefcaseBusiness },
] as const;

export function DashboardModeSwitcher({
	mode,
	isCollapsed,
	onModeChange,
}: DashboardModeSwitcherProps) {
	if (isCollapsed) {
		return (
			<div className="flex flex-col items-center gap-1 py-1">
				{MODES.map((item) => {
					const Icon = item.icon;
					const selected = mode === item.id;
					return (
						<Tooltip key={item.id} delayDuration={300}>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={item.label}
									aria-pressed={selected}
									onClick={() => onModeChange(item.id)}
									className={cn(
										"flex size-8 items-center justify-center rounded-md transition-colors",
										selected
											? "bg-accent text-foreground"
											: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
									)}
								>
									<Icon className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent side="right">{item.label}</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		);
	}

	return (
		<div className="py-1.5">
			<div className="grid grid-cols-3 gap-1 rounded-lg bg-background/70 p-1 shadow-inner">
				{MODES.map((item) => {
					const Icon = item.icon;
					const selected = mode === item.id;
					return (
						<button
							key={item.id}
							type="button"
							aria-pressed={selected}
							onClick={() => onModeChange(item.id)}
							className={cn(
								"flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
								selected
									? "bg-accent text-foreground shadow-sm"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							<Icon className="size-3.5 shrink-0" />
							<span className="truncate">{item.label}</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
