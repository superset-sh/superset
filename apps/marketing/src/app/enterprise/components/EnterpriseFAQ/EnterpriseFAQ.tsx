"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { HiPlus } from "react-icons/hi2";
import type { FAQItem } from "@/app/components/FAQSection";
import { ENTERPRISE_FAQ_ITEMS } from "./constants";

function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-");
}

function FAQAccordionItem({
	item,
	index,
	isOpen,
	onToggle,
}: {
	item: FAQItem;
	index: number;
	isOpen: boolean;
	onToggle: () => void;
}) {
	// Memoize ID generation and ensure uniqueness with index
	const contentId = useMemo(
		() => `faq-${slugify(item.question)}-${index}`,
		[item.question, index],
	);

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={isOpen}
				aria-controls={contentId}
				className="group flex w-full items-center justify-between py-5 text-left outline-none"
			>
				<span className="text-sm sm:text-base font-medium text-foreground pr-4">
					{item.question}
				</span>
				<HiPlus
					className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
						isOpen ? "rotate-45" : ""
					}`}
					aria-hidden="true"
				/>
			</button>
			<AnimatePresence initial={false}>
				{isOpen && (
					<motion.div
						id={contentId}
						role="region"
						aria-labelledby={contentId}
						initial={{ height: 0, opacity: 0 }}
						animate={{ height: "auto", opacity: 1 }}
						exit={{ height: 0, opacity: 0 }}
						transition={{ duration: 0.2, ease: "easeInOut" }}
						className="overflow-hidden"
					>
						<p className="pb-5 text-sm text-muted-foreground leading-relaxed pr-8">
							{item.answer}
						</p>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function EnterpriseFAQ() {
	const [openIndex, setOpenIndex] = useState<number | null>(null);

	const handleToggle = (index: number) => {
		setOpenIndex(openIndex === index ? null : index);
	};

	return (
		<div>
			<span className="text-sm font-mono text-muted-foreground uppercase tracking-wider">
				FAQ
			</span>
			<h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground mt-4 mb-8">
				Common questions
			</h2>
			<div>
				{ENTERPRISE_FAQ_ITEMS.map((item, index) => (
					<FAQAccordionItem
						key={item.question}
						item={item}
						index={index}
						isOpen={openIndex === index}
						onToggle={() => handleToggle(index)}
					/>
				))}
			</div>
		</div>
	);
}
