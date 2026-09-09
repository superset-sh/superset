"use client";

import { Trans } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
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
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0<m.h1",
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
		content: "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0</m.h1>",
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
		<m.div
			ref={ref}
			className="relative w-full min-w-[500px] max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />

			{/* Header */}
			<div className="relative flex items-center justify-between border-b border-border/60 bg-card px-3 py-2">
				<div className="flex items-center gap-3">
					<div className="flex gap-1.5">
						<div className="size-2 rounded-full bg-[#ff5f57]/85" />
						<div className="size-2 rounded-full bg-[#febc2e]/85" />
						<div className="size-2 rounded-full bg-[#28c840]/85" />
					</div>
					<span className="font-mono text-[10px] tracking-tight text-muted-foreground/60">
						components/HeroSection/HeroSection.tsx
					</span>
				</div>
				<div className="flex items-center gap-2 mx-2">
					<button
						type="button"
						className="whitespace-nowrap rounded-sm bg-foreground/[0.06] px-2 py-1 text-xs text-foreground/90 transition-colors"
					>
						<Trans>Side by Side</Trans>
					</button>
					<button
						type="button"
						className="rounded-sm px-2 py-1 text-xs text-muted-foreground/55 transition-colors hover:text-foreground/80"
					>
						<Trans>Inline</Trans>
					</button>
				</div>
			</div>

			<div className="flex">
				{/* Sidebar */}
				<div className="w-48 border-r border-border/60 bg-card">
					{/* Sidebar sections */}
					<div className="border-b border-border/60 p-2">
						<div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/65 text-xs">
							<HiOutlineChatBubbleLeftRight className="w-3.5 h-3.5" />
							<span>
								<Trans>Messages</Trans>
							</span>
						</div>
						<div className="flex items-center gap-2 px-2 py-1.5 text-muted-foreground/65 text-xs">
							<VscGitCommit className="w-3.5 h-3.5" />
							<span>
								<Trans>Commits</Trans>
							</span>
							<span className="ml-auto rounded bg-foreground/[0.07] px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground/70">
								3
							</span>
						</div>
						<div className="flex items-center gap-2 px-2 py-1.5 text-foreground/90 text-xs bg-foreground/[0.06] rounded-sm">
							<VscGitPullRequest className="w-3.5 h-3.5" />
							<span>
								<Trans>Against Main</Trans>
							</span>
							<HiOutlineCheck className="ml-auto w-3.5 h-3.5 text-emerald-400/85" />
						</div>
					</div>

					{/* Files */}
					<div className="p-2">
						<div className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65">
							<Trans>Unstaged</Trans>
						</div>
						{SIDEBAR_FILES.map((file, index) => (
							<m.div
								key={file.name}
								className="flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-foreground/[0.04] rounded-sm cursor-pointer"
								initial={{ opacity: 0, x: -5 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -5 }
								}
								transition={{
									duration: 0.2,
									delay: 0.2 + index * 0.05,
								}}
							>
								<HiOutlineDocumentText className="w-3.5 h-3.5 text-muted-foreground/55" />
								<span className="text-muted-foreground truncate flex-1">
									{file.name}
								</span>
								<span className="font-mono text-[10px] tabular-nums text-emerald-400/85">
									+{file.added}
								</span>
								{file.removed > 0 && (
									<span className="font-mono text-[10px] tabular-nums text-rose-400/75">
										-{file.removed}
									</span>
								)}
							</m.div>
						))}
					</div>
				</div>

				{/* Diff content */}
				<div className="flex-1 overflow-hidden">
					<div className="font-mono text-[11px]">
						{DIFF_LINES.map((line, index) => (
							<m.div
								key={line.id}
								className={`flex ${
									line.type === "added"
										? "bg-emerald-500/[0.08]"
										: line.type === "removed"
											? "bg-rose-500/[0.08]"
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
											? "text-emerald-400/60"
											: line.type === "removed"
												? "text-rose-400/60"
												: "text-muted-foreground/40"
									}`}
								>
									{index + 1}
								</span>
								<span
									className={`w-4 text-center select-none ${
										line.type === "added"
											? "text-emerald-400/85"
											: line.type === "removed"
												? "text-rose-400/75"
												: "text-muted-foreground/40"
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
											? "text-emerald-300/95"
											: line.type === "removed"
												? "text-rose-300/95"
												: "text-muted-foreground/75"
									}`}
								>
									{line.content}
								</span>
							</m.div>
						))}
					</div>
				</div>
			</div>
		</m.div>
	);
}
