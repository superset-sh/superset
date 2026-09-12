"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
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
	const { t } = useLingui();
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });

	return (
		<m.div
			ref={ref}
			className="relative w-full max-w-sm"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			{/* Window */}
			<div className="relative overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]">
				{/* Header */}
				<div className="relative flex items-center justify-between border-b border-border/60 bg-card px-3 py-2">
					<div className="flex items-center gap-2">
						<div className="flex gap-1.5">
							<div className="size-2 rounded-full bg-[#ff5f57]/85" />
							<div className="size-2 rounded-full bg-[#febc2e]/85" />
							<div className="size-2 rounded-full bg-[#28c840]/85" />
						</div>
						<span className="ml-2 rounded-sm bg-foreground/[0.07] px-2 py-0.5 font-mono text-[10px] text-muted-foreground/70">
							superset
						</span>
					</div>
					<div className="flex items-center gap-1.5 text-muted-foreground/55">
						<HiOutlineFolder className="w-3.5 h-3.5" />
						<span className="text-xs">src</span>
					</div>
				</div>

				{/* Toolbar row */}
				<div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
					{/* Search input */}
					<div className="flex flex-1 items-center gap-2 rounded-sm border border-border/60 px-2.5 py-1.5">
						<HiMagnifyingGlass className="w-3.5 h-3.5 text-muted-foreground/45" />
						<span className="text-xs text-muted-foreground/45">
							<Trans>Search files...</Trans>
						</span>
					</div>

					{/* Open in button */}
					<m.div
						className="inline-flex items-stretch"
						initial={{ opacity: 0, scale: 0.95 }}
						animate={
							isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.95 }
						}
						transition={{ duration: 0.3, delay: 0.2 }}
					>
						<button
							type="button"
							className="flex items-center gap-2 rounded-l-sm border border-r-0 border-border bg-card px-3 py-1.5 text-foreground/90 transition-colors hover:bg-foreground/[0.05]"
						>
							<Image
								src="/app-icons/cursor.svg"
								alt="Cursor"
								width={14}
								height={14}
								className="object-contain"
							/>
							<span className="font-medium text-xs">
								<Trans>Open in</Trans>
							</span>
						</button>
						<button
							type="button"
							className="flex items-center rounded-r-sm border border-border bg-card px-2 text-foreground/90 transition-colors hover:bg-foreground/[0.05]"
							aria-label={t({
								message: "Select IDE",
							})}
						>
							<HiChevronDown className="w-3.5 h-3.5" />
						</button>
					</m.div>
				</div>

				{/* File tree */}
				<div className="py-2">
					{FILE_TREE.map((item, index) => (
						<m.div
							key={item.name}
							className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors ${
								item.selected
									? "bg-foreground/[0.06] text-foreground/95"
									: "text-muted-foreground hover:bg-foreground/[0.04]"
							}`}
							style={{ paddingLeft: `${12 + (item.indent || 0) * 16}px` }}
							initial={{ opacity: 0, x: -5 }}
							animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -5 }}
							transition={{ duration: 0.2, delay: 0.15 + index * 0.03 }}
						>
							{item.type === "folder" ? (
								<>
									<HiChevronRight
										className={`w-3 h-3 text-muted-foreground/55 ${item.expanded ? "rotate-90" : ""}`}
									/>
									<HiOutlineFolder className="w-3.5 h-3.5 text-muted-foreground/65" />
								</>
							) : (
								<>
									<span className="w-3" />
									<HiOutlineDocument className="w-3.5 h-3.5 text-muted-foreground/55" />
								</>
							)}
							<span>{item.name}</span>
						</m.div>
					))}
				</div>
			</div>

			{/* Dropdown Menu - positioned outside window for overflow effect */}
			<m.div
				className="absolute -right-10 top-[104px] z-10 w-44 overflow-hidden rounded-lg border border-border bg-card py-1.5 shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
				initial={{ opacity: 0, y: -8 }}
				animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
				transition={{ duration: 0.3, delay: 0.4 }}
			>
				{IDE_OPTIONS.map((ide, index) => (
					<m.div
						key={ide.id}
						className="flex cursor-pointer items-center justify-between px-3 py-1.5 text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground/90"
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
							<span className="font-mono text-[10px] text-muted-foreground/45">
								{ide.shortcut}
							</span>
						)}
					</m.div>
				))}
			</m.div>
		</m.div>
	);
}
