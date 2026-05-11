"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import {
	LuChevronDown,
	LuExternalLink,
	LuPlay,
	LuPlus,
	LuTerminal,
	LuX,
} from "react-icons/lu";
import { AGENT_TABS } from "../../constants";
import type { ActiveDemo } from "../../types";

interface TabBarProps {
	activeDemo: ActiveDemo;
}

export function TabBar({ activeDemo }: TabBarProps) {
	const isSetup = activeDemo === "Create Parallel Branches";

	return (
		<div className="flex h-8 items-center gap-0.5 border-b border-border bg-card/40 px-2">
			<div className="relative flex h-full items-center gap-1.5 px-3 text-[11px] font-medium text-foreground/95">
				{isSetup ? (
					<LuTerminal className="size-3.5 text-muted-foreground/75" />
				) : (
					<Image
						src="/app-icons/claude.svg"
						alt="Claude"
						width={12}
						height={12}
					/>
				)}
				<span>{isSetup ? "setup" : "claude"}</span>
				<LuX className="size-3 text-muted-foreground/35" />
				<span className="absolute inset-x-2 -bottom-px h-[2px] bg-brand" />
			</div>

			{AGENT_TABS.map((tab) => (
				<motion.div
					key={tab.label}
					className="flex h-full items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground/65 hover:text-foreground/90"
					initial={{
						opacity: 0,
						width: 0,
						paddingLeft: 0,
						paddingRight: 0,
					}}
					animate={{
						opacity: activeDemo === "Use Any Agents" ? 1 : 0,
						width: activeDemo === "Use Any Agents" ? "auto" : 0,
						paddingLeft: activeDemo === "Use Any Agents" ? 12 : 0,
						paddingRight: activeDemo === "Use Any Agents" ? 12 : 0,
					}}
					transition={{
						duration: 0.25,
						ease: "easeOut",
						delay: activeDemo === "Use Any Agents" ? tab.delay : 0,
					}}
				>
					<Image src={tab.src} alt={tab.alt} width={12} height={12} />
					<span>{tab.label}</span>
					<LuX className="size-3 text-muted-foreground/30" />
				</motion.div>
			))}

			<button
				type="button"
				className="ml-1 flex h-6 items-center rounded-sm px-1.5 text-muted-foreground/45 hover:bg-foreground/[0.04] hover:text-foreground/85"
				aria-label="New tab"
			>
				<LuPlus className="size-3.5" />
				<LuChevronDown className="ml-0.5 size-3" />
			</button>

			<div className="ml-auto flex items-center gap-1.5">
				<button
					type="button"
					className="flex h-6 items-center gap-1 border border-border bg-background px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-foreground/85 hover:bg-foreground/[0.04]"
				>
					<LuExternalLink className="size-2.5 text-muted-foreground/65" />
					<span>Open</span>
					<LuChevronDown className="size-2.5 text-muted-foreground/55" />
				</button>
				<button
					type="button"
					className="flex h-6 items-center gap-1 border border-emerald-500/40 bg-emerald-500/15 px-2 text-[10px] font-medium uppercase tracking-[0.06em] text-emerald-300 hover:bg-emerald-500/25"
				>
					<LuPlay className="size-2.5 fill-current" />
					<span>Run</span>
				</button>
			</div>
		</div>
	);
}
