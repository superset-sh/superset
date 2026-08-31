"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "../../lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const _values = React.useMemo(
		() =>
			Array.isArray(value)
				? value
				: Array.isArray(defaultValue)
					? defaultValue
					: [min, max],
		[value, defaultValue, min, max],
	);

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className={cn(
					"bg-primary/20 relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5",
				)}
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className={cn(
						"bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full",
					)}
				/>
			</SliderPrimitive.Track>
			{Array.from({ length: _values.length }, (_, index) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					// biome-ignore lint/suspicious/noArrayIndexKey: slider thumbs don't reorder, index is stable
					key={index}
					className="border-primary/50 bg-background focus-visible:ring-ring block size-4 shrink-0 rounded-full border shadow transition-colors focus-visible:ring-1 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
