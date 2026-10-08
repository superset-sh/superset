"use client";

import { type CSSProperties, type ElementType, memo } from "react";
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
}: TextShimmerProps) => (
	<Component
		className={cn(
			variant === "tool"
				? "m-0 inline-flex h-4 items-center leading-none"
				: "inline-block",
			className,
			"relative animate-shimmer bg-[length:250%_100%,auto] bg-clip-text text-transparent",
			"bg-no-repeat [background-image:linear-gradient(90deg,#0000_calc(50%-var(--spread)),var(--color-foreground),#0000_calc(50%+var(--spread))),linear-gradient(color-mix(in_oklab,var(--color-foreground)_40%,transparent),color-mix(in_oklab,var(--color-foreground)_40%,transparent))]",
			"motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-muted-foreground",
		)}
		style={
			{
				"--spread": `${(children?.length ?? 0) * spread}px`,
				"--shimmer-duration": `${duration}s`,
			} as CSSProperties
		}
	>
		{children}
	</Component>
);

export const Shimmer = memo(ShimmerComponent);
