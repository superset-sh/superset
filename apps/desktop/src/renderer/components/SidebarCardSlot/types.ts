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
	/**
	 * Re-counts the impression when this changes. For cards whose "really
	 * shown" condition can change while `id` stays put — the star nag's button
	 * can appear after its card already won the slot, and only that counts as
	 * an impression of the star ask. Defaults to `id`.
	 */
	shownKey?: string;
	/** Fired once each time this entry becomes the visible card. */
	onShown?: () => void;
}
