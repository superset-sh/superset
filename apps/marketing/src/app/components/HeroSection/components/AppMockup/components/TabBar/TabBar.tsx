"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { LuChevronDown, LuPlus, LuTerminal } from "react-icons/lu";
import { AGENT_TABS } from "../../constants";
import type { ActiveDemo } from "../../types";

interface TabBarProps {
	activeDemo: ActiveDemo;
}

// Every tab in the strip shares this width so the row scans as a uniform rhythm
const TAB_WIDTH = 112;

export function TabBar({ activeDemo }: TabBarProps) {
	const isSetup = activeDemo === "Create Parallel Branches";

	return (
		<div className="flex h-9 items-center gap-0.5 bg-card">
			<div className="flex h-full min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-hide">
				<div
					className="flex h-full shrink-0 items-center gap-1.5 bg-background px-3 text-[11px] font-medium text-foreground/95"
					style={{ width: TAB_WIDTH }}
				>
					{isSetup ? (
						<LuTerminal className="size-3.5 shrink-0 text-muted-foreground/75" />
					) : (
						<Image
							src="/app-icons/claude.svg"
							alt="Claude"
							width={12}
							height={12}
						/>
					)}
					<span className="min-w-0 flex-1 truncate">
						{isSetup ? "setup" : "claude"}
					</span>
				</div>

				{AGENT_TABS.map((tab) => (
					<motion.div
						key={tab.label}
						className="flex h-full shrink-0 items-center gap-1.5 overflow-hidden text-[11px] text-muted-foreground/65 hover:text-foreground/90"
						initial={{
							opacity: 0,
							width: 0,
							paddingLeft: 0,
							paddingRight: 0,
						}}
						animate={{
							opacity: activeDemo === "Use Any Agents" ? 1 : 0,
							width: activeDemo === "Use Any Agents" ? TAB_WIDTH : 0,
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
						<span className="min-w-0 flex-1 truncate">{tab.label}</span>
					</motion.div>
				))}
			</div>

			<button
				type="button"
				className="ml-1 flex h-6 shrink-0 items-center rounded-sm px-1.5 text-muted-foreground/45 hover:bg-foreground/[0.04] hover:text-foreground/85"
				aria-label="New tab"
			>
				<LuPlus className="size-3.5" />
				<LuChevronDown className="ml-0.5 size-3" />
			</button>
		</div>
	);
}
