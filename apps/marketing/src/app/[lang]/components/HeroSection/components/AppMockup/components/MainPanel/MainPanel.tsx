"use client";

import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { m } from "framer-motion";
import Image from "next/image";
import { LuGitPullRequest } from "react-icons/lu";
import { AUTOMATIONS } from "../../constants";
import type { ActiveDemo } from "../../types";
import { AsciiSpinner } from "../AsciiSpinner";

function TokenChip({ children }: { children: React.ReactNode }) {
	return (
		<span className="rounded-sm bg-foreground/[0.07] px-1 py-px">
			{children}
		</span>
	);
}

interface MainPanelProps {
	activeDemo: ActiveDemo;
}

export function MainPanel({ activeDemo }: MainPanelProps) {
	const { t } = useLingui();
	const isAutomate = activeDemo === "Automate Tasks";
	const isRemote = activeDemo === "Remote Access";
	const isDefault = !isAutomate && !isRemote;

	return (
		<div className="flex min-w-0 flex-1 flex-col bg-background">
			<div className="relative flex-1 overflow-hidden p-5 font-mono text-[11px] leading-relaxed">
				<m.div
					className="flex h-full flex-col"
					initial={{ opacity: 1 }}
					animate={{ opacity: isDefault ? 1 : 0 }}
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
							<TokenChip>
								<span className="text-brand-light">/mcp</span>
							</TokenChip>
						</div>

						<div className="space-y-2.5 border-t border-border/60 pt-4">
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
								<TokenChip>
									<span className="text-muted-foreground/70">.mcp.json</span>
								</TokenChip>
							</div>
						</div>
					</div>

					{/* Elevated agent card: the story moment, floating like Linear's
					    agent panel */}
					<div className="absolute bottom-16 right-4 z-10 w-[290px] rounded-lg border border-white/[0.08] bg-card font-sans shadow-[0_1px_1px_rgba(0,0,0,0.4),0_16px_50px_-12px_rgba(0,0,0,0.7)]">
						<div className="pointer-events-none absolute inset-0 rounded-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
						<div className="flex items-center gap-2 px-3 pt-2.5">
							<Image
								src="/app-icons/claude.svg"
								alt="Claude"
								width={12}
								height={12}
							/>
							<span className="text-[11px] font-medium text-foreground/95">
								claude
							</span>
							<span className="text-[10px] text-muted-foreground/55">
								<Trans>finished · worked for 7s</Trans>
							</span>
						</div>
						<div className="px-3 pt-1.5 pb-2.5 text-[11px] leading-relaxed text-muted-foreground">
							<Trans>Pushed and opened a draft PR.</Trans>
						</div>
						<div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
							<div className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums">
								<LuGitPullRequest className="size-2.5 text-muted-foreground/55" />
								<span className="text-muted-foreground/75">
									<Plural value={2} one="# file" other="# files" />
								</span>
								<span className="text-emerald-400/85">+46</span>
								<span className="text-rose-400/75">−1</span>
							</div>
							<button
								type="button"
								className="rounded-full border border-white/[0.08] px-2.5 py-0.5 text-[10px] text-foreground/90 hover:bg-foreground/[0.05]"
							>
								<Trans>Preview</Trans>
							</button>
						</div>
					</div>

					<div className="mt-auto border-t border-border/60 pt-3 pb-1">
						<div className="flex items-center gap-2.5">
							<span className="text-muted-foreground/55">❯</span>
							<span className="h-3.5 w-[7px] bg-foreground/60" />
							<span className="flex-1 text-[11px] text-muted-foreground/40">
								<Trans>Type a task for Claude…</Trans>
							</span>
						</div>
					</div>
				</m.div>

				{/* Automate Tasks: scheduled agents running on their own */}
				<m.div
					className="absolute inset-0 p-5 font-mono text-[11px] leading-relaxed"
					initial={{ opacity: 0 }}
					animate={{ opacity: isAutomate ? 1 : 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
					style={{ pointerEvents: isAutomate ? "auto" : "none" }}
				>
					<div className="mb-5 text-foreground">
						<span className="text-muted-foreground/55">❯</span>{" "}
						<TokenChip>
							<span className="text-brand-light">superset automations</span>
						</TokenChip>
					</div>
					<div className="grid max-w-[380px] grid-cols-[1fr_auto_auto] gap-x-8 gap-y-2">
						<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
							<Trans>Name</Trans>
						</div>
						<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
							<Trans>Schedule</Trans>
						</div>
						<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
							<Trans>Last run</Trans>
						</div>
						{AUTOMATIONS.map((automation) => (
							<div key={automation.name} className="contents">
								<div className="text-foreground/90">{automation.name}</div>
								<div className="text-muted-foreground/65">
									{t(automation.schedule)}
								</div>
								{automation.running ? (
									<div className="flex items-center gap-1.5">
										<AsciiSpinner
											className="text-[10px]"
											toneClassName="text-brand-light"
										/>
										<span className="text-brand-light">
											<Trans>running</Trans>
										</span>
									</div>
								) : (
									<div className="text-muted-foreground/55">
										{t(automation.lastRun)}
									</div>
								)}
							</div>
						))}
					</div>
				</m.div>

				{/* Remote Access: same workspace model, on a box that isn't yours */}
				<m.div
					className="absolute inset-0 p-5 font-mono text-[11px] leading-relaxed"
					initial={{ opacity: 0 }}
					animate={{ opacity: isRemote ? 1 : 0 }}
					transition={{ duration: 0.3, ease: "easeOut" }}
					style={{ pointerEvents: isRemote ? "auto" : "none" }}
				>
					<div className="mb-3 text-foreground">
						<span className="text-muted-foreground/55">❯</span>{" "}
						<TokenChip>
							<span className="text-brand-light">superset connect gpu-box</span>
						</TokenChip>
					</div>
					<div className="space-y-1.5 text-muted-foreground">
						<div>
							<span className="text-emerald-400/85">✓</span> connected · us-east
							· 64 cores · 128 GB
						</div>
					</div>
				</m.div>
			</div>
		</div>
	);
}
