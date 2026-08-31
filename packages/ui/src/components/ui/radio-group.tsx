"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { CircleIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";

function RadioGroup({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			className={cn("grid gap-3", className)}
			{...props}
		/>
	);
}

function RadioGroupItem({
	className,
	...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-group-item"
			className={cn(
				"border-foreground/50 text-primary focus-visible:ring-ring aria-invalid:ring-destructive/20 aria-invalid:border-destructive data-[state=checked]:border-primary aspect-square size-4 shrink-0 rounded-full border transition-colors outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="relative flex items-center justify-center"
			>
				<CircleIcon className="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" />
			</RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

export { RadioGroup, RadioGroupItem };
