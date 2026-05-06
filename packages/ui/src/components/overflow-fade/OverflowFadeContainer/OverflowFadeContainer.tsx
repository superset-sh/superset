"use client";

import { type ComponentProps, useLayoutEffect, useRef } from "react";
import {
	type OverflowFadeState,
	useOverflowFade,
} from "../../../hooks/use-overflow-fade";
import { cn } from "../../../lib/utils";
import "../fade-edge.css";

type OverflowFadeEdge = "top" | "right" | "bottom" | "left";

const DEFAULT_FADE_EDGES: OverflowFadeEdge[] = ["right"];

interface OverflowFadeContainerProps extends ComponentProps<"div"> {
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

export function OverflowFadeContainer({
	ref: forwardedRef,
	className,
	fadeEdges = DEFAULT_FADE_EDGES,
	onOverflowChange,
	observeChildren = false,
	...props
}: OverflowFadeContainerProps) {
	const {
		ref,
		hasOverflowX,
		hasOverflowY,
		canScrollTop,
		canScrollRight,
		canScrollBottom,
		canScrollLeft,
	} = useOverflowFade<HTMLDivElement>({ observeChildren });

	const setRef = (node: HTMLDivElement | null) => {
		ref.current = node;
		if (typeof forwardedRef === "function") {
			forwardedRef(node);
		} else if (forwardedRef) {
			forwardedRef.current = node;
		}
	};

	const onOverflowChangeRef = useRef(onOverflowChange);
	useLayoutEffect(() => {
		onOverflowChangeRef.current = onOverflowChange;
	});

	useLayoutEffect(() => {
		onOverflowChangeRef.current?.({
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
}
