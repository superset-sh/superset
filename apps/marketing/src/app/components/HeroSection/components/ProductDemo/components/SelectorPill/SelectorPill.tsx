"use client";

import { motion } from "framer-motion";

interface SelectorPillProps {
	label: string;
	active?: boolean;
	onSelect?: () => void;
}

export function SelectorPill({
	label,
	active = false,
	onSelect,
}: SelectorPillProps) {
	return (
		<motion.button
			type="button"
			onMouseEnter={onSelect}
			onClick={onSelect}
			className={`
				inline-flex items-center justify-center py-2 text-xs sm:text-sm whitespace-nowrap cursor-pointer shrink-0
				${
					active
						? "mc-slot mc-slot-active text-[#FCDC5F]"
						: "mc-slot text-foreground/50 hover:text-foreground/70"
				}
			`}
			style={{
				fontFamily: "var(--font-geist-pixel-square)",
				textShadow: active ? "0 0 8px rgba(252, 220, 95, 0.4)" : "none",
			}}
			animate={{
				paddingLeft: active ? 18 : 12,
				paddingRight: active ? 18 : 12,
			}}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			{label}
		</motion.button>
	);
}
