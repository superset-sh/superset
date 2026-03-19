"use client";

import { motion } from "framer-motion";
import { LuFile, LuFolder } from "react-icons/lu";
import type { ActiveDemo } from "../../types";

interface ExternalIdePopupProps {
	activeDemo: ActiveDemo;
}

export function ExternalIdePopup({ activeDemo }: ExternalIdePopupProps) {
	const treeIconClassName = "size-3.5 shrink-0";

	return (
		<motion.div
			className="absolute bottom-6 right-6 w-[55%] overflow-hidden rounded-xl bg-black/50 shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)] backdrop-blur-xl"
			style={{ aspectRatio: "16/10" }}
			initial={{ opacity: 0, scale: 0.9, y: 20 }}
			animate={{
				opacity: activeDemo === "Open in Any IDE" ? 1 : 0,
				scale: activeDemo === "Open in Any IDE" ? 1 : 0.9,
				y: activeDemo === "Open in Any IDE" ? 0 : 20,
			}}
			transition={{ duration: 0.3, ease: "easeOut" }}
		>
			<div
				className="pointer-events-none absolute inset-0 z-10 rounded-xl"
				style={{
					background:
						"linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 26%, rgba(255,255,255,0.03) 74%, rgba(255,255,255,0.07) 100%)",
					mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					WebkitMask:
						"linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
					maskComposite: "exclude",
					WebkitMaskComposite: "xor",
					padding: "1.5px",
				}}
			/>

			<div className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.04] px-5 py-3 backdrop-blur-md">
				<div className="flex items-center gap-1.5">
					<div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
					<div className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
					<div className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
				</div>
				<span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/38">
					External IDE
				</span>
				<div className="w-12" />
			</div>

			<div className="flex h-[calc(100%-36px)]">
				<div className="w-[116px] border-r border-white/[0.06] bg-white/[0.02] p-5 text-[11px]">
					<div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/36">
						<LuFolder className={treeIconClassName} />
						<span>src</span>
					</div>
					<div className="ml-4 space-y-2">
						<div className="flex items-center gap-2 font-medium text-orange-500/75">
							<LuFile className={treeIconClassName} />
							<span>index.ts</span>
						</div>
						<div className="flex items-center gap-2 text-muted-foreground/30">
							<LuFile className={treeIconClassName} />
							<span>utils.ts</span>
						</div>
						<div className="flex items-center gap-2 text-muted-foreground/30">
							<LuFile className={treeIconClassName} />
							<span>types.ts</span>
						</div>
					</div>
				</div>

				<div className="flex-1 overflow-hidden bg-black/20 p-6 font-mono text-[11px]">
					<div className="space-y-2 leading-relaxed">
						<div>
							<span className="text-violet-300/60">import</span> {"{"} Agent{" "}
							{"}"} <span className="text-violet-300/60">from</span>{" "}
							<span className="text-stone-300/70">"ai"</span>
						</div>
						<div>
							<span className="text-violet-300/60">import</span> {"{"} tools{" "}
							{"}"} <span className="text-violet-300/60">from</span>{" "}
							<span className="text-stone-300/70">"./utils"</span>
						</div>
						<div className="text-muted-foreground/20">│</div>
						<div>
							<span className="text-violet-300/60">const</span>{" "}
							<span className="text-orange-500/75">agent</span> ={" "}
							<span className="text-stone-300/70">new</span> Agent({"{"}
						</div>
						<div className="pl-4">
							<span className="text-foreground/60">model:</span>{" "}
							<span className="text-stone-300/70">"claude-4"</span>,
						</div>
						<div className="pl-4">
							<span className="text-foreground/60">tools:</span> [tools.read,
							tools.write]
						</div>
						<div>{"}"})</div>
					</div>
				</div>
			</div>
		</motion.div>
	);
}
