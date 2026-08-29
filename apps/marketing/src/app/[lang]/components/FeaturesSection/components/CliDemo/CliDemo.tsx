"use client";

import { m, useInView } from "framer-motion";
import { useRef } from "react";

const WORKSPACE_ROWS = [
	{
		name: "fix onboarding crash",
		agent: "claude",
		state: "working",
		running: true,
	},
	{ name: "billing webhooks", agent: "codex", state: "review" },
	{ name: "speed up cold start", agent: "opencode", state: "ready" },
];

export function CliDemo() {
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
					superset (cli)
				</span>
			</div>

			<div className="space-y-1.5 p-4 font-mono text-[11px] leading-relaxed">
				<div className="text-foreground">
					<span className="text-muted-foreground/55">❯</span>{" "}
					<span className="text-brand-light">superset new</span>{" "}
					<span className="text-muted-foreground/70">
						&quot;fix onboarding crash&quot; --agent claude
					</span>
				</div>
				<m.div
					className="text-muted-foreground"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.25 }}
				>
					<span className="text-emerald-400/85">✓</span> workspace ready ·{" "}
					<span className="text-muted-foreground/55">fix-onboarding-crash</span>
				</m.div>

				<m.div
					className="pt-2 text-foreground"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.5 }}
				>
					<span className="text-muted-foreground/55">❯</span>{" "}
					<span className="text-brand-light">superset ls</span>
				</m.div>
				{WORKSPACE_ROWS.map((row, index) => (
					<m.div
						key={row.name}
						className="flex items-center gap-2 text-muted-foreground"
						initial={{ opacity: 0 }}
						animate={isInView ? { opacity: 1 } : { opacity: 0 }}
						transition={{ duration: 0.3, delay: 0.65 + index * 0.12 }}
					>
						{row.running ? (
							<span className="text-brand-light">⠋</span>
						) : (
							<span className="text-emerald-400/85">✓</span>
						)}
						<span className="min-w-0 flex-1 truncate">{row.name}</span>
						<span className="text-muted-foreground/55">{row.agent}</span>
						<span className="w-14 text-right text-muted-foreground/45">
							{row.state}
						</span>
					</m.div>
				))}
			</div>
		</m.div>
	);
}
