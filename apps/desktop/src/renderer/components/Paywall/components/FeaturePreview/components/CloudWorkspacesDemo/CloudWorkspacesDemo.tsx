import {
	HiArrowPath,
	HiCloud,
	HiComputerDesktop,
	HiDeviceTablet,
} from "react-icons/hi2";

const WORKSPACES = [
	{ id: "1", name: "superset-app", branch: "main", synced: true },
	{ id: "2", name: "api-server", branch: "feature/auth", synced: true },
	{ id: "3", name: "mobile-app", branch: "dev", synced: false },
];

export function CloudWorkspacesDemo() {
	return (
		<div className="w-full h-full flex items-center justify-center">
			<div className="w-[300px] bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a]/80 border-b border-white/5">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
							<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
						</div>
						<span className="text-xs text-white/60 ml-1">Cloud</span>
					</div>
				</div>

				{/* Cloud sync visual */}
				<div className="p-4">
					<div className="flex items-center justify-center gap-3 mb-4 py-3">
						<div className="flex flex-col items-center gap-1">
							<HiComputerDesktop className="w-6 h-6 text-white/50" />
							<span className="text-[9px] text-white/40">Desktop</span>
						</div>
						<div className="flex flex-col items-center">
							<div className="flex items-center gap-1">
								<div className="w-4 h-px bg-white/20" />
								<HiArrowPath className="w-3 h-3 text-white/30" />
								<div className="w-4 h-px bg-white/20" />
							</div>
						</div>
						<div className="flex flex-col items-center gap-1">
							<div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
								<HiCloud className="w-5 h-5 text-amber-400" />
							</div>
							<span className="text-[9px] text-white/40">Cloud</span>
						</div>
						<div className="flex flex-col items-center">
							<div className="flex items-center gap-1">
								<div className="w-4 h-px bg-white/20" />
								<HiArrowPath className="w-3 h-3 text-white/30" />
								<div className="w-4 h-px bg-white/20" />
							</div>
						</div>
						<div className="flex flex-col items-center gap-1">
							<HiDeviceTablet className="w-6 h-6 text-white/50" />
							<span className="text-[9px] text-white/40">Tablet</span>
						</div>
					</div>

					{/* Synced workspaces */}
					<div className="text-[10px] uppercase text-white/40 font-medium tracking-wider mb-2">
						Synced Workspaces
					</div>
					<div className="space-y-1.5">
						{WORKSPACES.map((ws) => (
							<div
								key={ws.id}
								className="flex items-center gap-2 px-2 py-1.5 rounded bg-white/5 text-xs"
							>
								<div
									className={`w-1.5 h-1.5 rounded-full ${ws.synced ? "bg-emerald-400" : "bg-amber-400"}`}
								/>
								<span className="text-white/70 truncate flex-1">{ws.name}</span>
								<span className="text-white/30 text-[10px]">{ws.branch}</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
