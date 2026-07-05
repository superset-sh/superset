"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useOverflowFade } from "../../../hooks/use-overflow-fade";
import { cn } from "../../../lib/utils";
import "../fade-edge.css";

interface OverflowFadeTextProps extends ComponentPropsWithoutRef<"span"> {
	/**
	 * Override the fade class for specialized text treatments. The default right
	 * fade is the expected choice for single-line labels.
	 */
	fadeClassName?: string;
}

export function OverflowFadeText({
	className,
	fadeClassName = "fade-edge-r",
	children,
	...props
}: OverflowFadeTextProps) {
	const { ref, hasOverflowX } = useOverflowFade<HTMLSpanElement>({
		observeParent: true,
	});

	return (
		<span
			ref={ref}
			className={cn(
				"min-w-0 overflow-hidden whitespace-nowrap",
				hasOverflowX && fadeClassName,
				className,
			)}
			{...props}
		>
			{children}
		</span>
	);
}
