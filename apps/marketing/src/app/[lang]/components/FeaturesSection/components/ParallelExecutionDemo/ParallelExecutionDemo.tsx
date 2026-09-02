"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { m, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { HiCheck } from "react-icons/hi2";

const GENERATING_STATUS: MessageDescriptor = msg({
	message: "Generating",
});

const IN_PROGRESS_TASKS = [
	{
		id: "task-1",
		name: "Analyze Tab vs Agent Usag...",
		status: GENERATING_STATUS,
		rotation: 45,
	},
	{
		id: "task-2",
		name: "PyTorch MNIST Experiments",
		status: GENERATING_STATUS,
		rotation: 180,
	},
	{
		id: "task-3",
		name: "Fix PR Comments Fetching I...",
		status: GENERATING_STATUS,
		rotation: 270,
	},
];

const READY_FOR_REVIEW = [
	{
		id: "review-1",
		name: "Enterprise Order Mana...",
		time: "now",
		added: 93,
		removed: 18,
	},
	{
		id: "review-2",
		name: "Set up Cursor Rules fo...",
		time: "30m",
		added: 37,
		removed: 0,
	},
	{
		id: "review-3",
		name: "Bioinformatics Tools",
		time: "45m",
		added: 135,
		removed: 21,
	},
];

const TERMINAL_LINES = [
	"❯ claude",
	" ",
	"Claude Code v2.0.74",
	"Opus 4.5 · Claude Max",
	" ",
	"❯ Implement order validation",
	" ",
	"I'll implement order validation.",
	"Let me examine the existing schema...",
	" ",
	"Read: src/schemas/order.ts",
	"Read: src/api/orders/validate.ts",
	" ",
	"✓ Added validation for required fields,",
	"  quantity checks, and price formats.",
];

function SpinnerIcon({
	className,
	rotation = 0,
}: {
	className?: string;
	rotation?: number;
}) {
	return (
		<m.svg
			className={className}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
			animate={{ rotate: [rotation, rotation + 360] }}
			transition={{
				duration: 5,
				repeat: Number.POSITIVE_INFINITY,
				ease: "linear",
			}}
		>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="3"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</m.svg>
	);
}

export function ParallelExecutionDemo() {
	const { t } = useLingui();
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });
	const [displayedLines, setDisplayedLines] = useState<string[]>([]);

	// Line-by-line animation
	useEffect(() => {
		if (!isInView) return;

		let lineIndex = 0;
		const interval = setInterval(() => {
			if (lineIndex < TERMINAL_LINES.length) {
				setDisplayedLines(TERMINAL_LINES.slice(0, lineIndex + 1));
				lineIndex++;
			} else {
				clearInterval(interval);
			}
		}, 150);

		return () => clearInterval(interval);
	}, [isInView]);

	return (
		<m.div
			ref={ref}
			className="relative w-full min-w-[500px] max-w-2xl overflow-hidden rounded-lg border border-border bg-background shadow-[0_1px_1px_rgba(0,0,0,0.4),0_24px_70px_-16px_rgba(0,0,0,0.75)]"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			<div className="pointer-events-none absolute inset-0 z-10 rounded-lg ring-1 ring-inset ring-white/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />

			{/* Window chrome */}
			<div className="relative flex h-8 items-center border-b border-border/60 bg-card px-3">
				<div className="flex items-center gap-1.5">
					<div className="size-2 rounded-full bg-[#ff5f57]/85" />
					<div className="size-2 rounded-full bg-[#febc2e]/85" />
					<div className="size-2 rounded-full bg-[#28c840]/85" />
				</div>
				<span className="pointer-events-none absolute inset-x-0 text-center font-mono text-[10px] tracking-tight text-muted-foreground/60">
					superset
				</span>
			</div>

			<div className="flex h-[360px]">
				{/* Sidebar */}
				<div className="w-56 shrink-0 overflow-hidden border-r border-border/60 bg-card">
					{/* In Progress Section */}
					<div className="p-3">
						<div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65">
							<Trans>In Progress</Trans>{" "}
							<span className="text-muted-foreground/40">
								{IN_PROGRESS_TASKS.length}
							</span>
						</div>
						{IN_PROGRESS_TASKS.map((task, index) => (
							<m.div
								key={task.id}
								className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1.5 hover:bg-foreground/[0.04]"
								initial={{ opacity: 0, x: -10 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
								}
								transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
							>
								<SpinnerIcon
									className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/55"
									rotation={task.rotation}
								/>
								<div className="min-w-0">
									<div className="truncate text-xs text-muted-foreground">
										{task.name}
									</div>
									<div className="text-[10px] text-muted-foreground/45">
										{t(task.status)}
									</div>
								</div>
							</m.div>
						))}
					</div>

					{/* Ready for Review Section */}
					<div className="p-3 pt-0">
						<div className="mb-2 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/65">
							<Trans>Ready for Review</Trans>{" "}
							<span className="text-muted-foreground/40">
								{READY_FOR_REVIEW.length}
							</span>
						</div>
						{READY_FOR_REVIEW.map((task, index) => (
							<m.div
								key={task.id}
								className="flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1.5 hover:bg-foreground/[0.04]"
								initial={{ opacity: 0, x: -10 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
								}
								transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
							>
								<HiCheck className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/55" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-1">
										<span className="truncate text-xs text-muted-foreground">
											{task.name}
										</span>
										<span className="shrink-0 text-[10px] text-muted-foreground/45">
											{task.time}
										</span>
									</div>
									<div className="flex items-center gap-1 font-mono text-[10px] tabular-nums">
										<span className="text-emerald-400/85">+{task.added}</span>
										{task.removed > 0 && (
											<span className="text-rose-400/75">−{task.removed}</span>
										)}
									</div>
								</div>
							</m.div>
						))}
					</div>
				</div>

				{/* Terminal Area */}
				<div className="flex min-w-0 flex-1 flex-col">
					{/* Terminal content */}
					<div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
						{displayedLines.map((line, index) => (
							<div
								key={`line-${index}-${line.slice(0, 10)}`}
								className={`${line.startsWith("❯") ? "text-foreground" : ""} ${line.startsWith("Read:") ? "text-muted-foreground/55" : ""} ${line.startsWith("✓") ? "text-emerald-400/85" : ""}`}
							>
								{line || " "}
							</div>
						))}
					</div>

					{/* Prompt row */}
					<div className="border-t border-border/60 px-4 pb-3 pt-3">
						<div className="flex items-center gap-2.5">
							<span className="text-muted-foreground/55">❯</span>
							<span className="h-3.5 w-[7px] bg-foreground/60" />
							<span className="flex-1 font-mono text-[11px] text-muted-foreground/40">
								<Trans>Type a task for Claude…</Trans>
							</span>
						</div>
					</div>
				</div>
			</div>
		</m.div>
	);
}
