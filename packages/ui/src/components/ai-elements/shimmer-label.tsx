"use client";

import { cn } from "../../lib/utils";
import type { TextShimmerProps } from "./shimmer";
import { Shimmer } from "./shimmer";

export type ShimmerLabelProps = Omit<
	TextShimmerProps,
	"children" | "className"
> & {
	children: string;
	className?: string;
	shimmerClassName?: string;
	isShimmering?: boolean;
};

export const ShimmerLabel = ({
	children,
	className,
	shimmerClassName,
	isShimmering = true,
	...props
}: ShimmerLabelProps) => (
	<span className={cn("shrink-0 whitespace-nowrap font-medium", className)}>
		{isShimmering ? (
			<Shimmer className={shimmerClassName} {...props}>
				{children}
			</Shimmer>
		) : (
			children
		)}
	</span>
);
