"use client";

import { m, useInView } from "framer-motion";
import { useRef } from "react";

const AUTOMATIONS = [
	{
		name: "daily-triage",
		schedule: "daily 9:00",
		lastRun: "running",
		running: true,
	},
	{ name: "changelog-draft", schedule: "sun 11:00", lastRun: "2h ago" },
	{ name: "dep-upgrades", schedule: "weekly", lastRun: "1d ago" },
	{ name: "roadmap-sync", schedule: "monthly", lastRun: "3d ago" },
];

const LOG_LINES = [
	"triaging 12 new issues…",
	"drafted 3 support replies",
	"opened PR #841 for review",
];

export function AutomationsDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<m.div
			ref={ref}
			className="relative w-full max-w-md overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />

			<div className="relative flex h-8 items-center border-b border-border/60 bg-card px-3">
				<div className="flex items-center gap-1.5">
					<div className="size-2 rounded-full bg-[#ff5f57]/85" />
					<div className="size-2 rounded-full bg-[#febc2e]/85" />
					<div className="size-2 rounded-full bg-[#28c840]/85" />
				</div>
				<span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[10px] tracking-tight text-muted-foreground/60">
					automations
				</span>
			</div>

			<div className="p-4 font-mono text-[11px] leading-relaxed">
				<div className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2">
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						Name
					</div>
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						Schedule
					</div>
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						Last run
					</div>
					{AUTOMATIONS.map((automation, index) => (
						<m.div
							key={automation.name}
							className="contents"
							initial={{ opacity: 0 }}
							animate={isInView ? { opacity: 1 } : { opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.15 + index * 0.08 }}
						>
							<div className="text-foreground/90">{automation.name}</div>
							<div className="text-muted-foreground/65">
								{automation.schedule}
							</div>
							{automation.running ? (
								<div className="text-brand-light">⠋ running</div>
							) : (
								<div className="text-muted-foreground/55">
									<span className="text-emerald-400/85">✓</span>{" "}
									{automation.lastRun}
								</div>
							)}
						</m.div>
					))}
				</div>

				<div className="mt-4 space-y-1 border-t border-border/60 pt-3">
					<div className="text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground/65">
						daily-triage
					</div>
					{LOG_LINES.map((line, index) => (
						<m.div
							key={line}
							className="text-muted-foreground/70"
							initial={{ opacity: 0 }}
							animate={isInView ? { opacity: 1 } : { opacity: 0 }}
							transition={{ duration: 0.3, delay: 0.5 + index * 0.15 }}
						>
							<span className="text-muted-foreground/45">→</span> {line}
						</m.div>
					))}
				</div>
			</div>
		</m.div>
	);
}
