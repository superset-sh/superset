"use client";

import { motion } from "motion/react";
import {
	type CSSProperties,
	type ElementType,
	type JSX,
	memo,
	useMemo,
} from "react";
import { cn } from "../../lib/utils";

export type TextShimmerProps = {
	children: string;
	as?: ElementType;
	className?: string;
	duration?: number;
	spread?: number;
	variant?: "tool" | "text";
};

const ShimmerComponent = ({
	children,
	as: Component = "span",
	className,
	duration = 2,
	spread = 2,
	variant = "tool",
}: TextShimmerProps) => {
	const MotionComponent = motion.create(
		Component as keyof JSX.IntrinsicElements,
	);

	const dynamicSpread = useMemo(
		() => (children?.length ?? 0) * spread,
		[children, spread],
	);

	return (
		<MotionComponent
			animate={{ backgroundPosition: "0% center" }}
			className={cn(
				variant === "tool"
					? "m-0 inline-flex h-4 items-center leading-none"
					: "inline-block",
				className,
				"relative bg-[length:250%_100%,auto] bg-clip-text text-transparent",
				"[--bg:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-background),#0000_calc(50%+var(--spread)))] [background-repeat:no-repeat,padding-box]",
			)}
			initial={{ backgroundPosition: "100% center" }}
			style={
				{
					"--spread": `${dynamicSpread}px`,
					backgroundImage:
						"var(--bg), linear-gradient(var(--color-muted-foreground), var(--color-muted-foreground))",
				} as CSSProperties
			}
			transition={{
				repeat: Number.POSITIVE_INFINITY,
				duration,
				ease: "linear",
			}}
		>
			{children}
		</MotionComponent>
	);
};

export const Shimmer = memo(ShimmerComponent);
