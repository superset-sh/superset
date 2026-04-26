"use client";

import {
	type ComponentPropsWithoutRef,
	type ForwardedRef,
	forwardRef,
	useCallback,
	useLayoutEffect,
} from "react";
import {
	type OverflowFadeState,
	useOverflowFade,
} from "../../../hooks/use-overflow-fade";
import { cn } from "../../../lib/utils";
import "../fade-edge.css";

type OverflowFadeEdge = "top" | "right" | "bottom" | "left";

interface OverflowFadeContainerProps extends ComponentPropsWithoutRef<"div"> {
	/**
	 * Edges to fade while that edge still has hidden scrollable content.
	 * Keep this for scroll containers; masks apply to the whole painted element.
	 */
	fadeEdges?: OverflowFadeEdge[];
	/**
	 * Reports measured overflow for consumers that need layout decisions, such as
	 * moving an action button outside the scroller once content overflows.
	 */
	onOverflowChange?: (state: OverflowFadeState) => void;
	/**
	 * Observe direct children for size/list changes. Useful for small dynamic
	 * scrollers such as tabs; avoid on large or virtualized lists without profiling.
	 */
	observeChildren?: boolean;
}

function setForwardedRef<TElement>(
	forwardedRef: ForwardedRef<TElement>,
	node: TElement | null,
) {
	if (typeof forwardedRef === "function") {
		forwardedRef(node);
		return;
	}
	if (forwardedRef) {
		forwardedRef.current = node;
	}
}

export const OverflowFadeContainer = forwardRef<
	HTMLDivElement,
	OverflowFadeContainerProps
>(function OverflowFadeContainer(
	{
		className,
		fadeEdges = ["right"],
		onOverflowChange,
		observeChildren = false,
		...props
	},
	forwardedRef,
) {
	const {
		ref,
		hasOverflowX,
		hasOverflowY,
		canScrollTop,
		canScrollRight,
		canScrollBottom,
		canScrollLeft,
	} = useOverflowFade<HTMLDivElement>({ observeChildren });

	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			ref.current = node;
			setForwardedRef(forwardedRef, node);
		},
		[forwardedRef, ref],
	);

	useLayoutEffect(() => {
		onOverflowChange?.({
			hasOverflowX,
			hasOverflowY,
			canScrollLeft,
			canScrollRight,
			canScrollTop,
			canScrollBottom,
		});
	}, [
		canScrollBottom,
		canScrollLeft,
		canScrollRight,
		canScrollTop,
		hasOverflowX,
		hasOverflowY,
		onOverflowChange,
	]);

	return (
		<div
			ref={setRef}
			className={cn(
				fadeEdges.includes("top") && canScrollTop && "fade-edge-t",
				fadeEdges.includes("right") && canScrollRight && "fade-edge-r",
				fadeEdges.includes("bottom") && canScrollBottom && "fade-edge-b",
				fadeEdges.includes("left") && canScrollLeft && "fade-edge-l",
				className,
			)}
			{...props}
		/>
	);
});
