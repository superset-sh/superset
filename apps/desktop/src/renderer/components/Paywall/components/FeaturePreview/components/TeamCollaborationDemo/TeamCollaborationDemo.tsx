import { HiCheck } from "react-icons/hi2";

const TEAM_MEMBERS = [
	{ name: "Sarah Chen", initials: "SC" },
	{ name: "Alex Rivera", initials: "AR" },
	{ name: "Jordan Lee", initials: "JL" },
	{ name: "Taylor Kim", initials: "TK" },
];

const ACTIVITY = [
	{ id: "1", user: "Sarah", action: "merged PR #142", time: "2m" },
	{ id: "2", user: "Alex", action: "started workspace", time: "5m" },
	{ id: "3", user: "Jordan", action: "completed task", time: "12m" },
];

export function TeamCollaborationDemo() {
	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-card/90 backdrop-blur-sm rounded-lg border border-border shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 bg-muted/80 border-b border-border/50">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-muted-foreground ml-1">Team</span>
					</div>
				</div>

				{/* Team members */}
				<div className="p-4">
					<div className="text-[10px] uppercase text-muted-foreground/70 font-medium tracking-wider mb-3">
						Online Now
					</div>
					<div className="flex items-center -space-x-2 mb-4">
						{TEAM_MEMBERS.map((member, index) => (
							<div
								key={member.name}
								className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-foreground/90 border-2 border-card bg-foreground/10"
								style={{ zIndex: TEAM_MEMBERS.length - index }}
							>
								{member.initials}
							</div>
						))}
						<div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium text-muted-foreground bg-foreground/10 border-2 border-card">
							+3
						</div>
					</div>

					{/* Activity feed */}
					<div className="text-[10px] uppercase text-muted-foreground/70 font-medium tracking-wider mb-2">
						Recent Activity
					</div>
					<div className="space-y-2">
						{ACTIVITY.map((item) => (
							<div key={item.id} className="flex items-center gap-2 text-xs">
								<HiCheck className="w-3 h-3 text-emerald-400 shrink-0" />
								<span className="text-foreground/80">
									<span className="text-foreground font-medium">
										{item.user}
									</span>{" "}
									{item.action}
								</span>
								<span className="text-muted-foreground/50 ml-auto">
									{item.time}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
