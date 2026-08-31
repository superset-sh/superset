"use client";

import { Controls as ControlsPrimitive } from "@xyflow/react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export type ControlsProps = ComponentProps<typeof ControlsPrimitive>;

export const Controls = ({ className, ...props }: ControlsProps) => (
	<ControlsPrimitive
		className={cn(
			"gap-px overflow-hidden rounded border bg-card p-1 shadow-none!",
			"[&>button]:rounded [&>button]:border-none! [&>button]:bg-transparent! [&>button]:hover:bg-fill-hover!",
			className,
		)}
		{...props}
	/>
);
