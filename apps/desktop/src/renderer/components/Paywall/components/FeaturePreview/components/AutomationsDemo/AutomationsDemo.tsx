import { LuClock, LuPlay } from "react-icons/lu";

const SCHEDULED = [
	{ id: "1", name: "Triage new issues", schedule: "Every weekday at 9am" },
	{ id: "2", name: "Bump dependencies", schedule: "Every Monday" },
	{ id: "3", name: "Sweep stale PRs", schedule: "Every 6 hours" },
];

export function AutomationsDemo() {
	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-2xl overflow-hidden">
				<div className="flex items-center justify-between px-4 py-3 bg-muted/80 border-b border-border/50">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-muted-foreground ml-1">
							Automations
						</span>
					</div>
				</div>

				<div className="p-4 space-y-1.5">
					{SCHEDULED.map((item) => (
						<div
							key={item.id}
							className="flex items-center gap-2 px-2 py-2 rounded bg-foreground/5"
						>
							<div className="size-2 rounded-full bg-emerald-500 shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="text-xs text-foreground/90 truncate">
									{item.name}
								</div>
								<div className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
									<LuClock className="size-3 shrink-0" />
									<span className="truncate">{item.schedule}</span>
								</div>
							</div>
							<LuPlay className="size-3 text-muted-foreground/60 shrink-0" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
