"use client";

import { motion } from "framer-motion";
import { LuArrowUp } from "react-icons/lu";
import { SETUP_STEPS } from "../../constants";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";

interface MainPanelProps {
	activeDemo: ActiveDemo;
}

export function MainPanel({ activeDemo }: MainPanelProps) {
	const isSetup = activeDemo === "Create Parallel Branches";

	return (
		<div className="flex min-w-0 flex-1 flex-col bg-background">
			<div className="relative flex-1 overflow-hidden p-5 font-mono text-[11px] leading-relaxed">
				<motion.div
					className="flex h-full flex-col"
					initial={{ opacity: 1 }}
					animate={{ opacity: isSetup ? 0 : 1 }}
					transition={{ duration: 0.2 }}
				>
					<div>
						<div className="mb-5 flex items-start gap-4">
							<div className="whitespace-pre text-[11px] leading-none text-brand">
								{`  * ▐▛███▜▌ *
 * ▝▜█████▛▘ *
  *  ▘▘ ▝▝  *`}
							</div>
							<div className="text-[11px] text-muted-foreground">
								<div>
									<span className="font-medium text-foreground">
										Claude Code
									</span>{" "}
									v2.0.74
								</div>
								<div>Opus 4.5 · Claude Max</div>
								<div className="text-muted-foreground/65">
									~/.superset/worktrees/superset/cloud-ws
								</div>
							</div>
						</div>

						<div className="mb-5 text-foreground">
							<span className="text-muted-foreground/55">❯</span>{" "}
							<span className="text-brand-light">/mcp</span>
						</div>

						<div className="space-y-2.5 border-t border-border pt-4">
							<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
								MCP Servers
							</div>
							<div className="text-[11px] text-muted-foreground">
								1 connected
							</div>

							<div>
								<span className="text-muted-foreground/55">❯</span>
								<span className="ml-1 text-foreground">1.</span>
								<span className="ml-1 text-brand-light">superset-mcp</span>
								<span className="ml-2 text-emerald-400/85">✓ connected</span>
							</div>

							<div className="text-muted-foreground/65">
								config:{" "}
								<span className="text-muted-foreground/50">.mcp.json</span>
							</div>
						</div>
					</div>

					<div className="mt-auto border-t border-border pt-4">
						<div className="flex items-center gap-3 border border-border bg-card/60 px-3 py-2.5">
							<span className="text-muted-foreground/55">❯</span>
							<span className="flex-1 text-[11px] text-muted-foreground/55">
								Type a task for Claude…
							</span>
							<div className="flex size-5 items-center justify-center rounded-sm bg-brand/15 text-[11px] text-brand-light">
								<LuArrowUp className="size-3" />
							</div>
						</div>
					</div>
				</motion.div>

				<motion.div
					className="absolute inset-0 p-5 font-mono text-[11px] leading-relaxed"
					initial={{ opacity: 0 }}
					animate={{ opacity: isSetup ? 1 : 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
					style={{ pointerEvents: isSetup ? "auto" : "none" }}
				>
					<div className="mb-3 text-foreground">
						<span className="text-muted-foreground/55">❯</span>{" "}
						<span className="text-brand-light">superset new</span>
					</div>
					<div className="space-y-1.5 text-muted-foreground">
						<div className="flex items-center gap-2">
							<AsciiSpinner
								className="text-[11px]"
								toneClassName="text-brand-light"
							/>
							<span>Setting up new parallel environment...</span>
						</div>
						{SETUP_STEPS.map((step) => (
							<div key={step} className="ml-5 text-muted-foreground/55">
								{step}
							</div>
						))}
					</div>
				</motion.div>
			</div>
		</div>
	);
}
