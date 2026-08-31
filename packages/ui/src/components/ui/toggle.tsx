"use client";

import * as TogglePrimitive from "@radix-ui/react-toggle";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const toggleVariants = cva(
	"inline-flex items-center justify-center gap-2 rounded border border-transparent text-sm font-medium hover:bg-grayAlpha-100 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:shadow-none transition-colors whitespace-nowrap",
	{
		variants: {
			variant: {
				default: "bg-transparent",
				outline: "border-border bg-transparent hover:bg-grayAlpha-100",
			},
			size: {
				default: "h-[var(--btn-h-lg)] px-2 min-w-[var(--btn-h-lg)]",
				sm: "h-[var(--btn-h-default)] px-1.5 min-w-[var(--btn-h-default)]",
				lg: "h-[var(--btn-h-xl)] px-2.5 min-w-[var(--btn-h-xl)]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Toggle({
	className,
	variant,
	size,
	...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
	VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive.Root
			data-slot="toggle"
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };
