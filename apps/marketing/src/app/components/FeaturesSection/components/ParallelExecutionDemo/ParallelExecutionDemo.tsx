"use client";

import { DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { HiCheck } from "react-icons/hi2";

const IN_PROGRESS_TASKS = [
	{
		id: "task-1",
		name: "Analyze Tab vs Agent Usag...",
		status: "Generating",
		rotation: 45,
	},
	{
		id: "task-2",
		name: "PyTorch MNIST Experiments",
		status: "Generating",
		rotation: 180,
	},
	{
		id: "task-3",
		name: "Fix PR Comments Fetching I...",
		status: "Generating",
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
		summary: "Perfect! I've implem...",
	},
	{
		id: "review-2",
		name: "Set up Cursor Rules fo...",
		time: "30m",
		added: 37,
		removed: 0,
		summary: "Set up Cursor Rules f...",
	},
	{
		id: "review-3",
		name: "Bioinformatics Tools",
		time: "45m",
		added: 135,
		removed: 21,
		summary: "Bioinformatics Tools",
	},
];

const TERMINAL_LINES = [
	"$ claude",
	"\u00A0",
	"╭──────────────────────────╮",
	"│\u00A0\u00A0Claude Code\u00A0\u00A0\u00A0\u00A0v1.0.42\u00A0\u00A0│",
	"╰──────────────────────────╯",
	"\u00A0",
	"> Implement order validation",
	"\u00A0",
	"I'll implement order validation.",
	"Let me examine the existing schema...",
	"\u00A0",
	"Read: src/schemas/order.ts",
	"Read: src/api/orders/validate.ts",
	"\u00A0",
	"✓ Added validation for required fields,",
	"\u00A0\u00A0quantity checks, and price formats.",
];

function SpinnerIcon({
	className,
	rotation = 0,
}: {
	className?: string;
	rotation?: number;
}) {
	return (
		<motion.svg
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
		</motion.svg>
	);
}

export function ParallelExecutionDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });
	const [displayedLines, setDisplayedLines] = useState<string[]>([]);
	const [showCursor, setShowCursor] = useState(true);
	const [inputValue, setInputValue] = useState("");
	const [chatMessages, setChatMessages] = useState<string[]>([]);

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

	// Blinking cursor
	useEffect(() => {
		const interval = setInterval(() => {
			setShowCursor((prev) => !prev);
		}, 530);
		return () => clearInterval(interval);
	}, []);

	// Auto-scroll to bottom when new messages are added
	useEffect(() => {
		if (terminalRef.current && chatMessages.length > 0) {
			terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
		}
	}, [chatMessages]);

	const handleSubmit = () => {
		if (!inputValue.trim()) return;
		setChatMessages((prev) => [...prev, `> ${inputValue}`]);
		setInputValue("");
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<motion.div
			ref={ref}
			className="w-full min-w-[500px] max-w-2xl bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden"
			initial={{ opacity: 0, y: 20 }}
			animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
			transition={{ duration: 0.5 }}
		>
			{/* Window chrome */}
			<div className="flex items-center gap-2 px-4 py-3 bg-[#2a2a2a]/80 border-b border-white/5">
				<div className="flex gap-1.5">
					<div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
					<div className="w-3 h-3 rounded-full bg-[#febc2e]" />
					<div className="w-3 h-3 rounded-full bg-[#28c840]" />
				</div>
				<span className="text-xs text-white/40 ml-2 font-mono">Superset</span>
			</div>

			<div className="flex h-[360px]">
				{/* Sidebar */}
				<div className="w-56 border-r border-white/5 bg-[#1e1e1e]/50 overflow-hidden flex-shrink-0">
					{/* In Progress Section */}
					<div className="p-3">
						<div className="text-[10px] uppercase text-white/40 font-medium tracking-wider mb-2">
							In Progress{" "}
							<span className="text-white/30">{IN_PROGRESS_TASKS.length}</span>
						</div>
						{IN_PROGRESS_TASKS.map((task, index) => (
							<motion.div
								key={task.id}
								className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-white/5 cursor-pointer"
								initial={{ opacity: 0, x: -10 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
								}
								transition={{ duration: 0.3, delay: 0.1 + index * 0.05 }}
							>
								<SpinnerIcon
									className="w-3.5 h-3.5 text-white/50 mt-0.5 flex-shrink-0"
									rotation={task.rotation}
								/>
								<div className="min-w-0">
									<div className="text-xs text-white/70 truncate">
										{task.name}
									</div>
									<div className="text-[10px] text-white/30">{task.status}</div>
								</div>
							</motion.div>
						))}
					</div>

					{/* Ready for Review Section */}
					<div className="p-3 pt-0">
						<div className="text-[10px] uppercase text-white/40 font-medium tracking-wider mb-2">
							Ready for Review{" "}
							<span className="text-white/30">{READY_FOR_REVIEW.length}</span>
						</div>
						{READY_FOR_REVIEW.map((task, index) => (
							<motion.div
								key={task.id}
								className="flex items-start gap-2 py-1.5 px-1 rounded hover:bg-white/5 cursor-pointer"
								initial={{ opacity: 0, x: -10 }}
								animate={
									isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -10 }
								}
								transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
							>
								<HiCheck className="w-3.5 h-3.5 text-white/50 mt-0.5 flex-shrink-0" />
								<div className="min-w-0 flex-1">
									<div className="flex items-center justify-between gap-1">
										<span className="text-xs text-white/70 truncate">
											{task.name}
										</span>
										<span className="text-[10px] text-white/30 flex-shrink-0">
											{task.time}
										</span>
									</div>
									<div className="flex items-center gap-1 text-[10px]">
										<span className="text-green-400">+{task.added}</span>
										{task.removed > 0 && (
											<span className="text-red-400">-{task.removed}</span>
										)}
										<span className="text-white/30 truncate">
											· {task.summary}
										</span>
									</div>
								</div>
							</motion.div>
						))}
					</div>
				</div>

				{/* Terminal Area */}
				<div className="flex-1 flex flex-col min-w-0">
					{/* Terminal content */}
					<div
						ref={terminalRef}
						className="flex-1 p-4 font-mono text-xs leading-relaxed text-white/80 overflow-y-auto"
					>
						{displayedLines.map((line, index) => (
							<div
								key={`line-${index}-${line.slice(0, 10)}`}
								className={`${line.startsWith("$") || line.startsWith(">") ? "text-green-400" : ""} ${line.startsWith("Read:") ? "text-blue-400" : ""} ${line.startsWith("✓") ? "text-green-400" : ""}`}
							>
								{line || "\u00A0"}
							</div>
						))}
						{chatMessages.map((line, index) => (
							<div key={`chat-${index}-${line.slice(0, 10)}`}>
								<div
									className={`${line.startsWith(">") ? "text-green-400" : ""}`}
								>
									{line || "\u00A0"}
								</div>
								<div className="mt-1">
									Try us out,{" "}
									<a
										href={DOWNLOAD_URL_MAC_ARM64}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
									>
										download Superset
									</a>
								</div>
								<div>{"\u00A0"}</div>
							</div>
						))}
						{displayedLines.length === TERMINAL_LINES.length && (
							<span
								className={`inline-block w-2 h-4 bg-white/70 ml-0.5 align-middle ${
									showCursor ? "opacity-100" : "opacity-0"
								}`}
							/>
						)}
					</div>

					{/* Input box */}
					<div className="border-t border-white/5 p-2">
						<div className="flex items-center gap-2 px-3 py-1.5 bg-[#2a2a2a]/60 rounded-lg border border-white/10">
							<span className="text-white/30 text-xs">{">"}</span>
							<input
								type="text"
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								onKeyDown={handleKeyDown}
								placeholder="Type a message..."
								className="text-white/80 text-xs flex-1 bg-transparent outline-none placeholder:text-white/50"
							/>
							<div className="flex items-center gap-1">
								<button
									type="button"
									onClick={handleSubmit}
									className="w-5 h-5 rounded bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
								>
									<span className="text-[10px] text-white/40">⌘</span>
								</button>
								<button
									type="button"
									onClick={handleSubmit}
									className="w-5 h-5 rounded bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
								>
									<span className="text-[10px] text-white/40">↵</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		</motion.div>
	);
}
