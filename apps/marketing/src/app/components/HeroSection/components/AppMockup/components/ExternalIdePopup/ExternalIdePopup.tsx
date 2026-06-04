"use client";

import { motion } from "framer-motion";
import { LuFile, LuFolder } from "react-icons/lu";
import type { ActiveDemo } from "../../types";

interface ExternalIdePopupProps {
	activeDemo: ActiveDemo;
}

export function ExternalIdePopup({ activeDemo }: ExternalIdePopupProps) {
	const treeIconClassName = "size-3 shrink-0";

	return (
		<motion.div
			className="absolute bottom-6 right-6 w-[55%] overflow-hidden rounded-lg border border-border bg-background shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
			style={{
				aspectRatio: "16/10",
				pointerEvents: activeDemo === "Open in Any IDE" ? "auto" : "none",
			}}
			initial={{ opacity: 0, scale: 0.94, y: 16 }}
			animate={{
				opacity: activeDemo === "Open in Any IDE" ? 1 : 0,
				scale: activeDemo === "Open in Any IDE" ? 1 : 0.94,
				y: activeDemo === "Open in Any IDE" ? 0 : 16,
			}}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.04]" />

			<div className="relative flex h-8 items-center border-b border-border bg-card px-3">
				<div className="flex items-center gap-1.5">
					<div className="size-2 rounded-full bg-[#ff5f57]/85" />
					<div className="size-2 rounded-full bg-[#febc2e]/85" />
					<div className="size-2 rounded-full bg-[#28c840]/85" />
				</div>
				<span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[10px] tracking-tight text-muted-foreground/60">
					Cursor — index.ts
				</span>
			</div>

			<div className="flex h-[calc(100%-32px)]">
				<div className="w-[120px] border-r border-border bg-card p-3 text-[11px]">
					<div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/55">
						<LuFolder className={treeIconClassName} />
						<span>src</span>
					</div>
					<div className="ml-3 space-y-0.5">
						<div className="relative flex items-center gap-1.5 rounded-sm bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/95">
							<span className="absolute inset-y-1 left-0 w-[2px] rounded-r-sm bg-brand" />
							<LuFile className={treeIconClassName} />
							<span>index.ts</span>
						</div>
						<div className="flex items-center gap-1.5 px-1.5 py-0.5 text-muted-foreground/55">
							<LuFile className={treeIconClassName} />
							<span>utils.ts</span>
						</div>
						<div className="flex items-center gap-1.5 px-1.5 py-0.5 text-muted-foreground/55">
							<LuFile className={treeIconClassName} />
							<span>types.ts</span>
						</div>
					</div>
				</div>

				<div className="flex-1 overflow-hidden p-4 font-mono text-[11px]">
					<div className="space-y-1.5 leading-relaxed">
						<div>
							<span className="text-violet-300">import</span> {"{"} Agent {"}"}{" "}
							<span className="text-violet-300">from</span>{" "}
							<span className="text-emerald-300/85">"ai"</span>
						</div>
						<div>
							<span className="text-violet-300">import</span> {"{"} tools {"}"}{" "}
							<span className="text-violet-300">from</span>{" "}
							<span className="text-emerald-300/85">"./utils"</span>
						</div>
						<div className="text-muted-foreground/30">│</div>
						<div>
							<span className="text-violet-300">const</span>{" "}
							<span className="text-brand-light">agent</span> ={" "}
							<span className="text-violet-300">new</span>{" "}
							<span className="text-foreground/95">Agent</span>({"{"}
						</div>
						<div className="pl-4">
							<span className="text-foreground/75">model:</span>{" "}
							<span className="text-emerald-300/85">"claude-4"</span>,
						</div>
						<div className="pl-4">
							<span className="text-foreground/75">tools:</span> [tools.read,
							tools.write]
						</div>
						<div>{"}"})</div>
					</div>
				</div>
			</div>
		</motion.div>
	);
}
