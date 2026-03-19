"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { LuChevronDown, LuPlus, LuTerminal, LuX } from "react-icons/lu";
import { AGENT_TABS, SETUP_STEPS } from "../../constants";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";

interface MainPanelProps {
	activeDemo: ActiveDemo;
}

export function MainPanel({ activeDemo }: MainPanelProps) {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex items-center gap-1 border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5 backdrop-blur-md h-12">
				<div className="flex items-center gap-1.5 rounded-t-xs border-b-2 border-orange-500/75 bg-orange-500/[0.05] px-4 py-2 text-[11px] font-medium text-foreground/90">
					{activeDemo === "Create Parallel Branches" ? (
						<>
							<LuTerminal className="size-3.5 text-muted-foreground/70" />
							<span>setup</span>
						</>
					) : (
						<>
							<Image
								src="/app-icons/claude.svg"
								alt="Claude"
								width={14}
								height={14}
							/>
							<span>claude</span>
						</>
					)}
					<LuX className="size-3.5 text-muted-foreground/30 hover:text-muted-foreground/50" />
				</div>

				{AGENT_TABS.map((tab) => (
					<motion.div
						key={tab.label}
						className="flex items-center gap-1.5 overflow-hidden rounded-t-xs py-2 text-[11px] text-muted-foreground/38 hover:bg-white/[0.03]"
						initial={{
							opacity: 0,
							width: 0,
							paddingLeft: 0,
							paddingRight: 0,
						}}
						animate={{
							opacity: activeDemo === "Use Any Agents" ? 1 : 0,
							width: activeDemo === "Use Any Agents" ? "auto" : 0,
							paddingLeft: activeDemo === "Use Any Agents" ? 14 : 0,
							paddingRight: activeDemo === "Use Any Agents" ? 14 : 0,
						}}
						transition={{
							duration: 0.25,
							ease: "easeOut",
							delay: activeDemo === "Use Any Agents" ? tab.delay : 0,
						}}
					>
						<Image src={tab.src} alt={tab.alt} width={14} height={14} />
						<span>{tab.label}</span>
						<LuX className="size-3.5 text-muted-foreground/20" />
					</motion.div>
				))}

				<div className="flex cursor-pointer items-center px-2.5 py-1.5 text-muted-foreground/20 hover:text-muted-foreground/40">
					<LuPlus className="size-4" />
					<LuChevronDown className="ml-0.5 size-3.5" />
				</div>
			</div>

			<div className="flex items-center gap-2 border-b border-white/[0.04] bg-black/20 px-5 py-3">
				<span className="text-[10px] text-muted-foreground/40">⬛</span>
				<span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/38">
					Terminal
				</span>
				<div className="flex-1" />
				<span className="text-[10px] text-muted-foreground/20">□</span>
				<LuX className="size-3.5 text-muted-foreground/20" />
			</div>

			<div className="relative flex-1 overflow-hidden bg-black/30 p-6 font-mono text-[11px] leading-relaxed backdrop-blur-sm">
				<motion.div
					className="flex h-full flex-col"
					initial={{ opacity: 1 }}
					animate={{
						opacity: activeDemo === "Create Parallel Branches" ? 0 : 1,
					}}
					transition={{ duration: 0.2, ease: "easeOut" }}
				>
					<div>
						<div className="mb-5 flex items-start gap-4">
							<div className="whitespace-pre text-[11px] leading-none text-[#D97757]/75">
								{`  * ▐▛███▜▌ *
 * ▝▜█████▛▘ *
  *  ▘▘ ▝▝  *`}
							</div>
							<div className="text-[11px] text-muted-foreground/90">
								<div>
									<span className="font-medium text-foreground">
										Claude Code
									</span>{" "}
									v2.0.74
								</div>
								<div>Opus 4.5 · Claude Max</div>
								<div className="text-muted-foreground/60">
									~/.superset/worktrees/superset/cloud-ws
								</div>
							</div>
						</div>

						<div className="mb-5 text-foreground">
							<span className="text-muted-foreground/60">❯</span>{" "}
							<span className="text-[#D97757]/80">/mcp</span>
						</div>

						<div className="space-y-3 border-t border-white/[0.04] pt-5">
							<div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground/52">
								MCP Servers
							</div>
							<div className="text-[11px] text-muted-foreground/72">
								1 connected
							</div>

							<div className="mt-2">
								<span className="text-muted-foreground/50">❯</span>
								<span className="ml-1 text-foreground">1.</span>
								<span className="ml-1 text-[#D97757]/75">superset-mcp</span>
								<span className="ml-2 text-emerald-300/75">✓ connected</span>
							</div>

							<div className="text-muted-foreground/60">
								config:{" "}
								<span className="text-muted-foreground/45">.mcp.json</span>
							</div>
						</div>
					</div>

					<div className="mt-auto border-t border-white/[0.04] pt-5">
						<div className="flex items-center gap-3 rounded-xs border border-white/[0.07] bg-black/20 px-4 py-3">
							<span className="text-muted-foreground/50">❯</span>
							<span className="flex-1 text-[11px] text-muted-foreground/35">
								Type a task for Claude...
							</span>
							<div className="flex size-5 items-center justify-center rounded-full bg-[#D97757]/15 text-[11px] text-[#D97757]/80">
								↑
							</div>
						</div>
					</div>
				</motion.div>

				<motion.div
					className="absolute inset-0 p-6 font-mono text-[11px] leading-relaxed"
					initial={{ opacity: 0 }}
					animate={{
						opacity: activeDemo === "Create Parallel Branches" ? 1 : 0,
					}}
					transition={{ duration: 0.3, ease: "easeOut" }}
					style={{
						pointerEvents:
							activeDemo === "Create Parallel Branches" ? "auto" : "none",
					}}
				>
					<div className="mb-3 text-foreground">
						<span className="text-muted-foreground/60">❯</span>{" "}
						<span className="text-[#D97757]/80">superset new</span>
					</div>
					<div className="space-y-2 text-muted-foreground/70">
						<div className="flex items-center gap-2">
							<AsciiSpinner
								className="text-[11px]"
								toneClassName="text-[#D97757]/80"
							/>
							<span>Setting up new parallel environment...</span>
						</div>
						{SETUP_STEPS.map((step) => (
							<div key={step} className="ml-5 text-muted-foreground/50">
								{step}
							</div>
						))}
					</div>
				</motion.div>
			</div>
		</div>
	);
}
