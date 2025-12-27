"use client";

import { motion, useInView } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import { HiOutlineTerminal } from "react-icons/hi";
import { HiOutlineCodeBracket, HiPlus } from "react-icons/hi2";

const AGENTS = [
	{ name: "Claude", icon: "/app-icons/claude.svg", size: 18 },
	{ name: "OpenCode", icon: "/app-icons/opencode.svg", size: 14 },
	{ name: "Codex", icon: "/app-icons/codex.svg", size: 18 },
	{ name: "Gemini", icon: "/app-icons/gemini.svg", size: 18 },
	{ name: "Cursor Agent", icon: "/app-icons/cursor-agent.svg", size: 18 },
];

export function UniversalCompatibilityDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<motion.div
			ref={ref}
			className="w-full max-w-xs bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a]/80 border-b border-white/5">
				<div className="flex items-center gap-2">
					<div className="flex gap-1.5">
						<div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
						<div className="w-3 h-3 rounded-full bg-[#febc2e]" />
						<div className="w-3 h-3 rounded-full bg-[#28c840]" />
					</div>
					<span className="text-xs font-medium text-white/80 ml-2 px-2 py-0.5 bg-white/10 rounded">
						superset
					</span>
				</div>
				<div className="flex items-center gap-1.5 text-white/50">
					<HiOutlineCodeBracket className="w-3.5 h-3.5" />
					<span className="text-xs">main</span>
				</div>
			</div>

			{/* New Terminal button */}
			<div className="px-3 py-2 border-b border-white/5">
				<div className="flex items-center gap-2 px-2 py-1.5 text-white/60 hover:text-white/80 hover:bg-white/5 rounded cursor-pointer transition-colors">
					<HiPlus className="w-4 h-4" />
					<span className="text-sm">New Terminal</span>
					<span className="ml-auto text-xs text-white/30">...</span>
					<HiOutlineTerminal className="w-4 h-4 text-white/30" />
				</div>
			</div>

			{/* Agent list */}
			<div className="py-2">
				{AGENTS.map((agent, index) => (
					<motion.div
						key={agent.name}
						className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 cursor-pointer transition-colors"
						initial={{ opacity: 0, x: -10 }}
						animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
						transition={{ duration: 0.3, delay: 0.1 + index * 0.08 }}
					>
						<div className="w-5 flex items-center justify-center shrink-0">
							<Image
								src={agent.icon}
								alt={agent.name}
								width={agent.size}
								height={agent.size}
								className="object-contain"
							/>
						</div>
						<span className="text-sm text-white/80">{agent.name}</span>
					</motion.div>
				))}
			</div>

			{/* Terminal count */}
			<div className="p-4 border-t border-white/5">
				<div className="flex items-center gap-2 text-white/40">
					<HiOutlineTerminal className="w-4 h-4" />
					<span className="text-xs">Terminals (3)</span>
				</div>
			</div>
		</motion.div>
	);
}
