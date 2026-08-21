import type { ReactNode } from "react";

/**
 * One candidate for the sidebar's single card slot. Card hooks return this
 * when they're eligible and `null` when they aren't; the slot picks the
 * highest-priority non-null entry and renders only that one.
 */
export interface SidebarCardEntry {
	/** Stable identity — drives the animation key and "did the winner change". */
	id: string;
	badge?: string;
	title: string;
	description?: string;
	actionLabel?: string;
	onAction?: () => void;
	/** Omit to make the card non-dismissible. */
	onDismiss?: () => void;
	className?: string;
	children?: ReactNode;
	/** Fired once each time this entry becomes the visible card. */
	onShown?: () => void;
}
