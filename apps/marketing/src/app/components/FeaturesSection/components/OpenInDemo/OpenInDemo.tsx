"use client";

import { motion, useInView } from "framer-motion";
import Image from "next/image";
import { useRef } from "react";
import {
	HiChevronDown,
	HiChevronRight,
	HiMagnifyingGlass,
	HiOutlineDocument,
	HiOutlineFolder,
} from "react-icons/hi2";

const IDE_OPTIONS = [
	{ id: "finder", label: "Finder", icon: "/app-icons/finder.png" },
	{
		id: "cursor",
		label: "Cursor",
		icon: "/app-icons/cursor.svg",
		shortcut: "⌘O",
	},
	{ id: "vscode", label: "VS Code", icon: "/app-icons/vscode.svg" },
	{ id: "xcode", label: "Xcode", icon: "/app-icons/xcode.svg" },
	{ id: "sublime", label: "Sublime Text", icon: "/app-icons/sublime.svg" },
	{ id: "terminal", label: "Terminal", icon: "/app-icons/terminal.png" },
	{ id: "jetbrains", label: "JetBrains", icon: "/app-icons/jetbrains.svg" },
];

const FILE_TREE = [
	{ type: "folder", name: "components", expanded: true },
	{ type: "file", name: "HeroSection.tsx", indent: 1, selected: true },
	{ type: "file", name: "constants.ts", indent: 1 },
	{ type: "file", name: "index.ts", indent: 1 },
	{ type: "folder", name: "hooks", expanded: false },
	{ type: "folder", name: "utils", expanded: false },
];

export function OpenInDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<motion.div
			ref={ref}
			className="relative w-full max-w-sm"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			{/* Window */}
			<div className="bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden">
				{/* Header */}
				<div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a]/80 border-b border-white/5 rounded-t-lg">
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
						<HiOutlineFolder className="w-3.5 h-3.5" />
						<span className="text-xs">src</span>
					</div>
				</div>

				{/* Toolbar row */}
				<div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/5">
					{/* Search input */}
					<div className="flex items-center gap-2 px-2.5 py-1.5 border border-white/5 rounded-md flex-1">
						<HiMagnifyingGlass className="w-3.5 h-3.5 text-white/30" />
						<span className="text-xs text-white/30">Search files...</span>
					</div>

					{/* Open in button */}
					<motion.div
						className="inline-flex items-stretch"
						initial={{ opacity: 0, scale: 0.95 }}
						animate={
							isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }
						}
						transition={{ duration: 0.3, delay: 0.2 }}
					>
						<button
							type="button"
							className="flex items-center gap-2 px-3 py-1.5 text-white/90 bg-[#2a2a2a] border border-white/10 border-r-0 rounded-l-md hover:bg-[#3a3a3a] transition-colors"
						>
							<Image
								src="/app-icons/cursor.svg"
								alt="Cursor"
								width={14}
								height={14}
								className="object-contain"
							/>
							<span className="font-medium text-xs">Open in</span>
						</button>
						<button
							type="button"
							className="flex items-center px-2 text-white/90 bg-[#2a2a2a] border border-white/10 rounded-r-md hover:bg-[#3a3a3a] transition-colors"
							aria-label="Select IDE"
						>
							<HiChevronDown className="w-3.5 h-3.5" />
						</button>
					</motion.div>
				</div>

				{/* File tree */}
				<div className="py-2">
					{FILE_TREE.map((item, index) => (
						<motion.div
							key={item.name}
							className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors ${
								item.selected
									? "bg-white/10 text-white/90"
									: "text-white/60 hover:bg-white/5"
							}`}
							style={{ paddingLeft: `${12 + (item.indent || 0) * 16}px` }}
							initial={{ opacity: 0, x: -5 }}
							animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -5 }}
							transition={{ duration: 0.2, delay: 0.15 + index * 0.03 }}
						>
							{item.type === "folder" ? (
								<>
									<HiChevronRight
										className={`w-3 h-3 text-white/40 ${item.expanded ? "rotate-90" : ""}`}
									/>
									<HiOutlineFolder className="w-3.5 h-3.5 text-white/50" />
								</>
							) : (
								<>
									<span className="w-3" />
									<HiOutlineDocument className="w-3.5 h-3.5 text-white/40" />
								</>
							)}
							<span>{item.name}</span>
						</motion.div>
					))}
				</div>
			</div>

			{/* Dropdown Menu - positioned outside window for overflow effect */}
			<motion.div
				className="absolute -right-10 top-[104px] w-44 bg-[#1e1e1e] border border-white/10 rounded-md shadow-2xl overflow-hidden z-10 py-2"
				initial={{ opacity: 0, y: -8 }}
				animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
				transition={{ duration: 0.3, delay: 0.4 }}
			>
				{IDE_OPTIONS.map((ide, index) => (
					<motion.div
						key={ide.id}
						className="flex items-center justify-between px-3 py-1.5 text-white/80 hover:bg-white/5 cursor-pointer transition-colors"
						initial={{ opacity: 0, x: -10 }}
						animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }}
						transition={{ duration: 0.2, delay: 0.5 + index * 0.04 }}
					>
						<div className="flex items-center gap-2">
							<div className="w-4 h-4 flex items-center justify-center">
								<Image
									src={ide.icon}
									alt={ide.label}
									width={16}
									height={16}
									className="object-contain"
								/>
							</div>
							<span className="text-xs">{ide.label}</span>
						</div>
						{ide.shortcut && (
							<span className="text-[10px] text-white/40">{ide.shortcut}</span>
						)}
					</motion.div>
				))}
			</motion.div>
		</motion.div>
	);
}
