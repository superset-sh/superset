import type * as React from "react";

import { cn } from "../../lib/utils";

const inputVariants = {
	default: [
		"file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground bg-input h-[var(--input-h)] min-h-[var(--input-h)] w-full min-w-0 rounded border-none px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
		"focus-visible:border-none focus-visible:ring-transparent",
		"aria-invalid:ring-destructive/20 aria-invalid:border-destructive aria-invalid:ring-[3px]",
	],
	ghost: "bg-transparent outline-none text-sm",
};

interface InputProps extends React.ComponentProps<"input"> {
	variant?: keyof typeof inputVariants;
}

function Input({ className, type, variant = "default", ...props }: InputProps) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputVariants[variant], className)}
			{...props}
		/>
	);
}

export { Input };
