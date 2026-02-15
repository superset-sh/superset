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
				inline-flex items-center justify-center py-2 text-xs sm:text-sm whitespace-nowrap cursor-pointer shrink-0 rounded-full
				${
					active
						? "bg-foreground/90 border border-foreground text-background/80"
						: "bg-foreground/[0.03] border border-foreground/10 text-foreground/50 hover:bg-foreground/[0.06] hover:border-foreground/20 hover:text-foreground/70"
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
