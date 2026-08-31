import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
	"inline-flex items-center justify-center h-5 rounded border px-1.5 py-0.5 text-sm font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1.5 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
	{
		variants: {
			variant: {
				default:
					"border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
				secondary:
					"border-transparent bg-grayAlpha-100 text-foreground [a&]:hover:bg-grayAlpha-200",
				ghost:
					"border-transparent bg-transparent text-foreground [a&]:hover:bg-grayAlpha-100",
				destructive:
					"border-transparent bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/80 focus-visible:ring-destructive/20",
				outline:
					"border-border bg-background text-foreground [a&]:hover:bg-grayAlpha-100",
				box: "rounded-none border-accent-foreground/20 bg-accent text-accent-foreground text-[10px] uppercase tracking-wider px-1.5 py-0",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function Badge({
	className,
	variant,
	asChild = false,
	...props
}: React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "span";

	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
