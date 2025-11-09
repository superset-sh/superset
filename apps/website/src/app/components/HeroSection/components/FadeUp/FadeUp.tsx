"use client";

import { motion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

interface FadeUpProps {
	children: ReactNode;
	delay?: number;
	duration?: number;
	className?: string;
}

const fadeUpVariants: Variants = {
	hidden: {
		opacity: 0,
		y: 24,
	},
	visible: {
		opacity: 1,
		y: 0,
	},
};

export function FadeUp({
	children,
	delay = 0,
	duration = 0.5,
	className,
}: FadeUpProps) {
	return (
		<motion.div
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, margin: "-50px" }}
			transition={{
				duration,
				delay,
				ease: [0.21, 0.47, 0.32, 0.98],
			}}
			variants={fadeUpVariants}
			className={className}
		>
			{children}
		</motion.div>
	);
}
