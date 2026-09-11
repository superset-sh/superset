import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

/**
 * Expands a small icon button's clickable area without changing its visual
 * size or the space it takes in the layout — an absolutely-positioned
 * pseudo-element (out of flow, so flex/grid sizing and overflow math never
 * see it) extends the hit region a few pixels past the button's own box, in
 * every direction, regardless of how small the icon or its own padding is.
 * Apply alongside a button's normal classes: `cn(HIT_SLOP, "p-0.5 ...")`.
 * The button needs no other setup — `relative` is included here.
 */
export const HIT_SLOP =
	"relative before:absolute before:-inset-1.5 before:content-['']";
