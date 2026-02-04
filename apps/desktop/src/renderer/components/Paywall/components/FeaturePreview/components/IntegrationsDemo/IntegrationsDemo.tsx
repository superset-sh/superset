import { HiArrowPath, HiCheck } from "react-icons/hi2";
import { SiGithub, SiLinear } from "react-icons/si";

const SYNCED_ITEMS = [
	{ id: "1", type: "issue", name: "SUP-142: Fix auth flow", status: "synced" },
	{ id: "2", type: "pr", name: "PR #89: Add workspace sync", status: "synced" },
	{
		id: "3",
		type: "issue",
		name: "SUP-156: Mobile responsive",
		status: "syncing",
	},
];

export function IntegrationsDemo() {
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
						<span className="text-xs text-muted-foreground ml-1">
							Integrations
						</span>
					</div>
				</div>

				{/* Connected services */}
				<div className="p-4">
					<div className="flex items-center justify-center gap-6 mb-4 py-2">
						<div className="flex flex-col items-center gap-1.5">
							<div className="w-10 h-10 rounded-lg bg-[#5E6AD2] flex items-center justify-center">
								<SiLinear className="w-5 h-5 text-white" />
							</div>
							<span className="text-[10px] text-muted-foreground">Linear</span>
						</div>
						<div className="flex items-center gap-1">
							<div className="w-6 h-px bg-foreground/20" />
							<HiArrowPath className="w-4 h-4 text-muted-foreground/70 animate-spin-slow" />
							<div className="w-6 h-px bg-foreground/20" />
						</div>
						<div className="flex flex-col items-center gap-1.5">
							<div className="w-10 h-10 rounded-lg bg-[#24292e] flex items-center justify-center">
								<SiGithub className="w-5 h-5 text-white" />
							</div>
							<span className="text-[10px] text-muted-foreground">GitHub</span>
						</div>
					</div>

					{/* Synced items */}
					<div className="text-[10px] uppercase text-muted-foreground/70 font-medium tracking-wider mb-2">
						Synced Items
					</div>
					<div className="space-y-1.5">
						{SYNCED_ITEMS.map((item) => (
							<div
								key={item.id}
								className="flex items-center gap-2 px-2 py-1.5 rounded bg-foreground/5 text-xs"
							>
								{item.status === "synced" ? (
									<HiCheck className="w-3 h-3 text-emerald-400 shrink-0" />
								) : (
									<HiArrowPath className="w-3 h-3 text-amber-400 shrink-0 animate-spin" />
								)}
								<span className="text-foreground/80 truncate">{item.name}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
