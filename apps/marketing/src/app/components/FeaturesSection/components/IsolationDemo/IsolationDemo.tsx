"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
	HiOutlineChatBubbleLeftRight,
	HiOutlineCheck,
	HiOutlineDocumentText,
} from "react-icons/hi2";
import { VscGitCommit, VscGitPullRequest } from "react-icons/vsc";

const SIDEBAR_FILES = [
	{ name: "HeroSection.tsx", added: 12, removed: 3 },
	{ name: "GridBackground.ts", added: 45, removed: 0 },
	{ name: "constants.ts", added: 8, removed: 2 },
	{ name: "ProductDemo.tsx", added: 23, removed: 15 },
];

const DIFF_LINES = [
	{ id: "line-1", type: "context", content: "export function HeroSection() {" },
	{ id: "line-2", type: "context", content: "\u00A0\u00A0return (" },
	{
		id: "line-3",
		type: "removed",
		content: '\u00A0\u00A0\u00A0\u00A0<div className="hero-old">',
	},
	{
		id: "line-4",
		type: "added",
		content: '\u00A0\u00A0\u00A0\u00A0<section className="relative py-24">',
	},
	{
		id: "line-5",
		type: "added",
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0<GridBackground />",
	},
	{
		id: "line-6",
		type: "context",
		content:
			'\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0<div className="max-w-7xl mx-auto">',
	},
	{
		id: "line-7",
		type: "removed",
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0<h1>Welcome</h1>",
	},
	{
		id: "line-8",
		type: "added",
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0<motion.h1",
	},
	{
		id: "line-9",
		type: "added",
		content:
			"\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0initial={{ opacity: 0 }}",
	},
	{
		id: "line-10",
		type: "added",
		content:
			"\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0animate={{ opacity: 1 }}",
	},
	{
		id: "line-11",
		type: "added",
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0>",
	},
	{
		id: "line-12",
		type: "added",
		content:
			"\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0Superset",
	},
	{
		id: "line-13",
		type: "added",
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0</motion.h1>",
	},
	{
		id: "line-14",
		type: "context",
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0</div>",
	},
	{ id: "line-15", type: "removed", content: "\u00A0\u00A0\u00A0\u00A0</div>" },
	{
		id: "line-16",
		type: "added",
		content: "\u00A0\u00A0\u00A0\u00A0</section>",
	},
	{ id: "line-17", type: "context", content: "\u00A0\u00A0);" },
	{ id: "line-18", type: "context", content: "}" },
];

export function IsolationDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<motion.div
			ref={ref}
			className="w-full min-w-[500px] max-w-2xl bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			{/* Header */}
			<div className="flex items-center justify-between px-4 py-2 bg-[#2a2a2a]/80 border-b border-white/5">
				<div className="flex items-center gap-3">
					<div className="flex gap-1.5">
						<div className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
						<div className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
					</div>
					<span className="text-xs text-white/60 font-mono">
						components/HeroSection/HeroSection.tsx
					</span>
				</div>
				<div className="flex items-center gap-2 mx-2">
					<button
						type="button"
						className="px-2 py-1 text-xs text-white/60 hover:text-white/80 bg-white/5 rounded transition-colors whitespace-nowrap"
					>
						Side by Side
					</button>
					<button
						type="button"
						className="px-2 py-1 text-xs text-white/40 hover:text-white/60 rounded transition-colors"
					>
						Inline
					</button>
				</div>
			</div>

			<div className="flex">
				{/* Sidebar */}
				<div className="w-48 border-r border-white/5 bg-[#1e1e1e]/50">
					{/* Sidebar sections */}
					<div className="p-2 border-b border-white/5">
						<div className="flex items-center gap-2 px-2 py-1.5 text-white/50 text-xs">
							<HiOutlineChatBubbleLeftRight className="w-3.5 h-3.5" />
							<span>Messages</span>
						</div>
						<div className="flex items-center gap-2 px-2 py-1.5 text-white/50 text-xs">
							<VscGitCommit className="w-3.5 h-3.5" />
							<span>Commits</span>
							<span className="ml-auto bg-white/10 px-1.5 rounded text-[10px]">
								3
							</span>
						</div>
						<div className="flex items-center gap-2 px-2 py-1.5 text-white/80 text-xs bg-white/5 rounded">
							<VscGitPullRequest className="w-3.5 h-3.5" />
							<span>Against Main</span>
							<HiOutlineCheck className="ml-auto w-3.5 h-3.5 text-green-400" />
						</div>
					</div>

					{/* Files */}
					<div className="p-2">
						<div className="text-[10px] uppercase text-white/30 px-2 py-1">
							Unstaged
						</div>
						{SIDEBAR_FILES.map((file, index) => (
							<motion.div
								key={file.name}
								className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-white/5 rounded cursor-pointer"
								initial={{ opacity: 0, x: -5 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -5 }
								}
								transition={{
									duration: 0.2,
									delay: 0.2 + index * 0.05,
								}}
							>
								<HiOutlineDocumentText className="w-3.5 h-3.5 text-white/40" />
								<span className="text-white/70 truncate flex-1">
									{file.name}
								</span>
								<span className="text-green-400 text-[10px]">
									+{file.added}
								</span>
								{file.removed > 0 && (
									<span className="text-red-400 text-[10px]">
										-{file.removed}
									</span>
								)}
							</motion.div>
						))}
					</div>
				</div>

				{/* Diff content */}
				<div className="flex-1 overflow-hidden">
					<div className="font-mono text-xs">
						{DIFF_LINES.map((line, index) => (
							<motion.div
								key={line.id}
								className={`flex ${
									line.type === "added"
										? "bg-green-500/10"
										: line.type === "removed"
											? "bg-red-500/10"
											: ""
								}`}
								initial={{ opacity: 0 }}
								animate={isInView ? { opacity: 1 } : { opacity: 0 }}
								transition={{
									duration: 0.15,
									delay: 0.3 + index * 0.04,
								}}
							>
								<span
									className={`w-8 text-right pr-2 select-none ${
										line.type === "added"
											? "text-green-400/60"
											: line.type === "removed"
												? "text-red-400/60"
												: "text-white/20"
									}`}
								>
									{index + 1}
								</span>
								<span
									className={`w-4 text-center select-none ${
										line.type === "added"
											? "text-green-400"
											: line.type === "removed"
												? "text-red-400"
												: "text-white/20"
									}`}
								>
									{line.type === "added"
										? "+"
										: line.type === "removed"
											? "-"
											: " "}
								</span>
								<span
									className={`flex-1 px-2 ${
										line.type === "added"
											? "text-green-300/90"
											: line.type === "removed"
												? "text-red-300/90"
												: "text-white/60"
									}`}
								>
									{line.content}
								</span>
							</motion.div>
						))}
					</div>
				</div>
			</div>
		</motion.div>
	);
}
