import { useWindowDimensions } from "react-native";

/** Widest a column of prose, rows or cards gets before it centers. */
export const READABLE_WIDTH = 720;

/**
 * Horizontal padding that centers a scroll view's content in a
 * `READABLE_WIDTH` column once the window is wider than that — an iPad, or a
 * wide Split View / Stage Manager window — and is just `base` on a phone.
 * Code, diffs and the terminal stay full width; don't use it there.
 */
export function useReadableInset(base = 0): number {
	const { width } = useWindowDimensions();
	return Math.max(base, (width - READABLE_WIDTH) / 2);
}
