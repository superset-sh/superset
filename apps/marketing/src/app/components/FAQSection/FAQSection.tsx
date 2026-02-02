"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HiPlus } from "react-icons/hi2";

interface FAQItem {
	question: string;
	answer: string;
}

const FAQ_ITEMS: FAQItem[] = [
	{
		question: "I already use an IDE like Cursor, is this for me?",
		answer:
			"Superset is designed to work with your existing tool, we natively support deep-linking to IDEs like Cursor so you can open your workspaces and files in your IDE.",
	},
	{
		question: "Which AI coding agents are supported?",
		answer:
			"Superset works with any CLI-based coding agent including Claude Code, OpenCode, OpenAI Codex, and more. If it runs in a terminal, it runs in Superset.",
	},
	{
		question: "How does the parallel agent system work?",
		answer:
			"Each agent runs in its own isolated Git worktree, which means they can work on different branches or features simultaneously without conflicts. You can monitor all agents in real-time and switch between them instantly.",
	},
	{
		question: "Is Superset free to use?",
		answer:
			"Yes, Superset is completely free and open source. You can self-host it, modify it, and use it however you like. The source code is available on GitHub under a permissive license.",
	},
	{
		question: "Can I use my own API keys?",
		answer:
			"Absolutely. Superset doesn't proxy any API calls. You use your own API keys directly with whatever AI providers you choose. This means you have full control over costs and usage.",
	},
];

function FAQAccordionItem({
	item,
	isOpen,
	onToggle,
}: {
	item: FAQItem;
	isOpen: boolean;
	onToggle: () => void;
}) {
	return (
		<div className="border-b border-border">
			<button
				type="button"
				onClick={onToggle}
				className="group flex w-full items-center justify-between py-6 text-left transition-all outline-none"
			>
				<span className="text-base sm:text-lg font-medium text-foreground pr-4">
					{item.question}
				</span>
				<HiPlus
					className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 ${
						isOpen ? "rotate-45" : ""
					}`}
				/>
			</button>
			<AnimatePresence initial={false}>
				{isOpen && (
					<motion.div
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
						className="overflow-hidden"
					>
						<p className="pb-6 text-base text-muted-foreground leading-relaxed pr-12">
							{item.answer}
						</p>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function FAQSection() {
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	const handleToggle = (index: number) => {
		setOpenIndex(openIndex === index ? null : index);
	};

	return (
		<section className="relative py-24 px-8 lg:px-[30px]">
			<div className="max-w-7xl mx-auto">
				<div className="grid grid-cols-1 xl:grid-cols-[1fr_1.5fr] gap-12 xl:gap-20">
					{/* Left Column - Title */}
					<div className="xl:sticky xl:top-24 xl:self-start">
						<h2 className="text-3xl sm:text-4xl xl:text-5xl font-medium tracking-tight text-foreground leading-[1.1]">
							Frequently
							<br />
							asked questions
						</h2>
					</div>

					{/* Right Column - Accordion */}
					<div>
						<div className="w-full">
							{FAQ_ITEMS.map((item, index) => (
								<FAQAccordionItem
									key={item.question}
									item={item}
									isOpen={openIndex === index}
									onToggle={() => handleToggle(index)}
								/>
							))}
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
