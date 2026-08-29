"use client";

import { Trans } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import { HiOutlineTerminal } from "react-icons/hi";
import { HiPlus } from "react-icons/hi2";

const AGENTS = [
	{ name: "Claude", icon: "/app-icons/claude.svg", size: 18 },
	{ name: "OpenCode", icon: "/app-icons/opencode.svg", size: 14 },
	{ name: "Codex", icon: "/app-icons/codex.svg", size: 18 },
	{ name: "Gemini", icon: "/app-icons/gemini.svg", size: 18 },
	{ name: "Cursor Agent", icon: "/app-icons/cursor-agent.svg", size: 18 },
	{ name: "Mistral Vibe", icon: "/app-icons/vibe.svg", size: 18 },
	{ name: "Kimi Code", icon: "/app-icons/kimi.svg", size: 18 },
	{ name: "Grok CLI", icon: "/app-icons/grok.svg", size: 18 },
	{ name: "Hermes", icon: "/app-icons/hermes.svg", size: 18 },
	{ name: "fx", icon: "/app-icons/fx.svg", size: 18 },
	{ name: "Antigravity", icon: "/app-icons/agy.svg", size: 18 },
	{ name: "Kiro", icon: "/app-icons/kiro.svg", size: 18 },
];

const TERMINAL_COUNT = 3;

export function UniversalCompatibilityDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<m.div
			ref={ref}
			className="relative w-full max-w-xs overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
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
					new terminal
				</span>
			</div>

			<div className="border-b border-border/60 px-2 py-1.5">
				<div className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground/90">
					<HiPlus className="size-3.5" />
					<span>
						<Trans id="marketing.features.compatibility.newTerminal">
							New Terminal
						</Trans>
					</span>
					<HiOutlineTerminal className="ml-auto size-3.5 text-muted-foreground/45" />
				</div>
			</div>

			<div className="py-1.5">
				{AGENTS.map((agent, index) => (
					<m.div
						key={agent.name}
						className="flex cursor-pointer items-center gap-3 px-4 py-1.5 text-[12px] text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground/90"
						initial={{ opacity: 0, x: -10 }}
						animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
						transition={{ duration: 0.3, delay: 0.1 + index * 0.08 }}
					>
						<div className="flex w-5 shrink-0 items-center justify-center">
							<Image
								src={agent.icon}
								alt={agent.name}
								width={agent.size}
								height={agent.size}
								className="object-contain"
							/>
						</div>
						<span>{agent.name}</span>
					</m.div>
				))}
			</div>

			<div className="border-t border-border/60 px-4 py-3">
				<div className="flex items-center gap-2 text-muted-foreground/55">
					<HiOutlineTerminal className="size-3.5" />
					<span className="text-[11px]">
						<Trans id="marketing.features.compatibility.terminalCount">
							Terminals ({TERMINAL_COUNT})
						</Trans>
					</span>
				</div>
			</div>
		</m.div>
	);
}
