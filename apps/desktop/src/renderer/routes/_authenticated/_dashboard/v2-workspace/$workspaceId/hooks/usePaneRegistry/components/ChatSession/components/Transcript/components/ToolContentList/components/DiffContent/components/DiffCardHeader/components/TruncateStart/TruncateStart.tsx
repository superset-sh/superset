import { cn } from "@superset/ui/utils";
import type { CSSProperties } from "react";

/** Generated content, so a copied path does not carry the mark. */
const BIDI_MARK_STYLE = { "--bidi-mark": "'‎'" } as CSSProperties;

/**
 * Truncates from the left, so a long path keeps the segments nearest the file.
 * The mark keeps the bidi algorithm from reordering the punctuation.
 */
export function TruncateStart({
	children,
	className,
	title,
}: {
	children: string;
	className?: string;
	title?: string;
}) {
	return (
		<span
			className={cn(
				"block min-w-0 truncate before:content-[var(--bidi-mark)]",
				className,
			)}
			dir="rtl"
			style={BIDI_MARK_STYLE}
			title={title}
		>
			{children}
		</span>
	);
}
