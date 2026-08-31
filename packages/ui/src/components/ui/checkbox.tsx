"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { CheckIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";

function Checkbox({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer border-foreground/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:ring-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive size-4 shrink-0 rounded border transition-colors outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-current transition-none"
			>
				{/* text-current is load-bearing: DropdownMenuItem and CommandItem force
			    any svg without a text- class to muted-foreground, which washes the
			    check out against the checked bg-primary fill. */}
				<CheckIcon className="size-3.5 text-current" />
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
