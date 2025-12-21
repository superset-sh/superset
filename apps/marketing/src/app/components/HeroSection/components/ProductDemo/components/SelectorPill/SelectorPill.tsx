"use client";

import { motion } from "framer-motion";

interface SelectorPillProps {
	label: string;
	active?: boolean;
	onClick?: () => void;
}

export function SelectorPill({
	label,
	active = false,
	onClick,
}: SelectorPillProps) {
	return (
		<motion.button
			type="button"
			onClick={onClick}
			className={`
				inline-flex items-center justify-center py-2 text-sm whitespace-nowrap cursor-pointer
				${
					active
						? "bg-foreground/90 border border-foreground text-background/80"
						: "bg-foreground/5 border border-foreground/20 text-foreground/80 hover:bg-foreground/10 hover:border-foreground/30"
				}
			`}
			animate={{
				paddingLeft: active ? 22 : 16,
				paddingRight: active ? 22 : 16,
			}}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			{label}
		</motion.button>
	);
}
