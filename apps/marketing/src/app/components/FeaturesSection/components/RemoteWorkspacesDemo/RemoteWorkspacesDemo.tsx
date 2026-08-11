"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const WORKSPACES = [
	{ name: "nightly evals", detail: "claude · 42m", running: true },
	{ name: "api hotfix", detail: "ready for review" },
	{ name: "docs refresh", detail: "PR opened" },
];

export function RemoteWorkspacesDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<motion.div
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
					gpu-box — ssh
				</span>
			</div>

			<div className="space-y-1.5 p-4 font-mono text-[11px] leading-relaxed">
				<div className="text-foreground">
					<span className="text-muted-foreground/55">❯</span>{" "}
					<span className="text-brand-light">ssh gpu-box</span>
				</div>
				<motion.div
					className="text-muted-foreground/65"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.2 }}
				>
					Welcome to gpu-box · us-east · 64 cores · 128 GB
				</motion.div>
				<motion.div
					className="pt-2 text-foreground"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.4 }}
				>
					<span className="text-muted-foreground/55">❯</span>{" "}
					<span className="text-brand-light">superset status</span>
				</motion.div>
				<motion.div
					className="text-muted-foreground"
					initial={{ opacity: 0 }}
					animate={isInView ? { opacity: 1 } : { opacity: 0 }}
					transition={{ duration: 0.3, delay: 0.55 }}
				>
					3 workspaces running
				</motion.div>
				{WORKSPACES.map((workspace, index) => (
					<motion.div
						key={workspace.name}
						className="text-muted-foreground"
						initial={{ opacity: 0 }}
						animate={isInView ? { opacity: 1 } : { opacity: 0 }}
						transition={{ duration: 0.3, delay: 0.7 + index * 0.12 }}
					>
						{workspace.running ? (
							<span className="text-brand-light">⠋</span>
						) : (
							<span className="text-emerald-400/85">✓</span>
						)}{" "}
						{workspace.name} ·{" "}
						<span className="text-muted-foreground/55">{workspace.detail}</span>
					</motion.div>
				))}
			</div>
		</motion.div>
	);
}
