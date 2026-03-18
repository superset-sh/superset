"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { HiPlus } from "react-icons/hi2";
import type { FAQItem } from "@/app/components/FAQSection";
import { ENTERPRISE_FAQ_ITEMS } from "./constants";

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
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={onToggle}
				className="group flex w-full items-center justify-between py-5 text-left outline-none"
			>
				<span className="text-sm sm:text-base font-medium text-foreground pr-4">
					{item.question}
				</span>
				<HiPlus
					className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
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
						isOpen={openIndex === index}
						onToggle={() => handleToggle(index)}
					/>
				))}
			</div>
		</div>
	);
}
