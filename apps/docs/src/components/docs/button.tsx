import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
	"inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-ring disabled:pointer-events-none disabled:opacity-50",
	{
		variants: {
			variant: {
				default:
					"bg-fd-primary text-fd-primary-foreground shadow hover:bg-fd-primary/90",
				destructive:
					"bg-fd-destructive text-fd-destructive-foreground shadow-sm hover:bg-fd-destructive/90",
				outline:
					"border border-fd-input bg-fd-background shadow-sm hover:bg-fd-accent hover:text-fd-accent-foreground",
				secondary:
					"bg-fd-secondary text-fd-secondary-foreground shadow-sm hover:bg-fd-secondary/80",
				ghost: "hover:bg-fd-accent hover:text-fd-accent-foreground",
				link: "text-fd-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-9 px-4 py-2",
				sm: "h-8 rounded-md px-3 text-xs",
				lg: "h-10 rounded-md px-8",
				icon: "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

export interface ButtonProps
	extends ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	className?: string;
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
	return (
		<button
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { buttonVariants };
