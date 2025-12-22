"use client";

import { motion, useInView } from "framer-motion";
import { useEffect, useRef, useState } from "react";

const TERMINAL_CONTENT = `Enterprise Order Management System

Building a unified platform for handling complex orders in our
order management system. Make sure it handles validation
properly.

Perfect! I've implemented a robust builder pattern for the order.

Key Features:
• Fluent Interface: Chain methods for readable order
• Validation: Ensures orders have customers, items, and
  valid quantities
• Discount Logic: Quantity-based pricing
• Type Safety: Validates quantities, prices, and discounts`;

export function ParallelExecutionDemo() {
	const ref = useRef<HTMLDivElement>(null);
	const isInView = useInView(ref, { once: true, margin: "-100px" });
	const [displayedText, setDisplayedText] = useState("");
	const [showCursor, setShowCursor] = useState(true);

	// Typing animation
	useEffect(() => {
		if (!isInView) return;

		let index = 0;
		const interval = setInterval(() => {
			if (index < TERMINAL_CONTENT.length) {
				setDisplayedText(TERMINAL_CONTENT.slice(0, index + 1));
				index++;
			} else {
				clearInterval(interval);
			}
		}, 15);

		return () => clearInterval(interval);
	}, [isInView]);

	// Blinking cursor
	useEffect(() => {
		const interval = setInterval(() => {
			setShowCursor((prev) => !prev);
		}, 530);
		return () => clearInterval(interval);
	}, []);

	return (
		<motion.div
			ref={ref}
			className="w-full max-w-md bg-[#1a1a1a]/90 backdrop-blur-sm rounded-lg border border-white/10 shadow-2xl overflow-hidden"
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

			{/* Terminal content */}
			<div className="p-4 font-mono text-xs leading-relaxed text-white/80 h-[280px] overflow-hidden">
				<pre className="whitespace-pre-wrap">
					{displayedText}
					<span
						className={`inline-block w-2 h-4 bg-white/70 ml-0.5 align-middle ${
							showCursor ? "opacity-100" : "opacity-0"
						}`}
					/>
				</pre>
			</div>
		</motion.div>
	);
}
