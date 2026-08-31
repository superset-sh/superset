import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded border border-transparent text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-none focus-visible:shadow-none focus-visible:border-border-focused",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
				destructive:
					"bg-red-100 text-red-500 hover:bg-red-200 active:bg-red-300",
				outline:
					"border-border shadow-none hover:bg-grayAlpha-100 active:bg-grayAlpha-200",
				secondary:
					"bg-grayAlpha-100 hover:bg-grayAlpha-200 active:bg-grayAlpha-300",
				ghost: "hover:bg-grayAlpha-100 active:bg-grayAlpha-200",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-[var(--btn-h-default)] rounded px-2 py-1",
				xs: "h-[var(--btn-h-xs)] rounded gap-1.5 px-1 py-1 text-xs [&_svg:not([class*='size-'])]:size-3.5",
				sm: "h-[var(--btn-h-sm)] rounded gap-1.5 px-2",
				lg: "h-[var(--btn-h-lg)] rounded px-4 py-2",
				xl: "h-[var(--btn-h-xl)] rounded px-8 text-base",
				"2xl": "h-[var(--btn-h-2xl)] rounded px-8",
				icon: "size-[var(--btn-h-default)]",
				"icon-sm": "size-[var(--btn-h-sm)]",
				"icon-xs":
					"size-[var(--btn-h-xs)] [&_svg:not([class*='size-'])]:size-3.5",
				"icon-lg": "size-[var(--btn-h-lg)]",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
