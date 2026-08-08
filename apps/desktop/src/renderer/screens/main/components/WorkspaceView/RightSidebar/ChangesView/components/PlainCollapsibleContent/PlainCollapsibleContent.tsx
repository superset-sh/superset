import { cn } from "@superset/ui/utils";
import type { ReactNode } from "react";

interface PlainCollapsibleContentProps {
	id: string;
	isOpen: boolean;
	className?: string;
	children: ReactNode;
}

/**
 * Drop-in replacement for `@superset/ui/collapsible`'s Radix-backed
 * `CollapsibleContent`, for spots that mount many rows at once (e.g. one per
 * file/folder/commit in the Changes panel).
 *
 * Radix's `CollapsibleContent` runs a mount layout effect that calls
 * `node.getBoundingClientRect()` on every instance so it can expose
 * `--radix-collapsible-content-height`/`-width` for CSS height transitions.
 * None of the Changes panel rows animate height, so that measurement is pure
 * overhead — with hundreds of rows mounting in one commit it becomes layout
 * thrashing that freezes the renderer (superset-sh/superset#5521). This
 * renders straight off the `isOpen` state the caller already tracks, with no
 * measurement and no forced reflow.
 *
 * Pair with a trigger that sets `aria-controls={id}` to preserve the a11y
 * link Radix would otherwise wire up automatically.
 */
export function PlainCollapsibleContent({
	id,
	isOpen,
	className,
	children,
}: PlainCollapsibleContentProps) {
	return (
		<div
			id={id}
			data-state={isOpen ? "open" : "closed"}
			hidden={!isOpen}
			className={cn(className)}
		>
			{isOpen ? children : null}
		</div>
	);
}
