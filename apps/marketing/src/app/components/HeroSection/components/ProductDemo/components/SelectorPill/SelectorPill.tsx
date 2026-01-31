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
						? "bg-foreground/90 border border-foreground text-background/80"
						: "bg-foreground/5 border border-foreground/20 text-foreground/80 hover:bg-foreground/10 hover:border-foreground/30"
				}
			`}
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
