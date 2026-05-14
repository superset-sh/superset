"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

interface UseOverflowFadeOptions {
	observeChildren?: boolean;
	observeParent?: boolean;
}

export interface OverflowFadeState {
	hasOverflowX: boolean;
	hasOverflowY: boolean;
	canScrollLeft: boolean;
	canScrollRight: boolean;
	canScrollTop: boolean;
	canScrollBottom: boolean;
}

const INITIAL_STATE: OverflowFadeState = {
	hasOverflowX: false,
	hasOverflowY: false,
	canScrollLeft: false,
	canScrollRight: false,
	canScrollTop: false,
	canScrollBottom: false,
};

function getOverflowState(node: HTMLElement): OverflowFadeState {
	const maxScrollLeft = node.scrollWidth - node.clientWidth;
	const maxScrollTop = node.scrollHeight - node.clientHeight;

	return {
		hasOverflowX: maxScrollLeft > 1,
		hasOverflowY: maxScrollTop > 1,
		canScrollLeft: node.scrollLeft > 1,
		canScrollRight: node.scrollLeft < maxScrollLeft - 1,
		canScrollTop: node.scrollTop > 1,
		canScrollBottom: node.scrollTop < maxScrollTop - 1,
	};
}

function areOverflowStatesEqual(
	left: OverflowFadeState,
	right: OverflowFadeState,
): boolean {
	return (
		left.hasOverflowX === right.hasOverflowX &&
		left.hasOverflowY === right.hasOverflowY &&
		left.canScrollLeft === right.canScrollLeft &&
		left.canScrollRight === right.canScrollRight &&
		left.canScrollTop === right.canScrollTop &&
		left.canScrollBottom === right.canScrollBottom
	);
}

export function useOverflowFade<TElement extends HTMLElement>({
	observeChildren = false,
	observeParent = false,
}: UseOverflowFadeOptions = {}) {
	const ref = useRef<TElement>(null);
	const [state, setState] = useState<OverflowFadeState>(INITIAL_STATE);

	const updateOverflow = useCallback(() => {
		const node = ref.current;
		if (!node) return;

		const nextState = getOverflowState(node);
		setState((currentState) =>
			areOverflowStatesEqual(currentState, nextState)
				? currentState
				: nextState,
		);
	}, []);

	useLayoutEffect(() => {
		const node = ref.current;
		if (!node) return;

		const resizeObserver = new ResizeObserver(updateOverflow);

		const observeResizeTargets = () => {
			resizeObserver.disconnect();
			resizeObserver.observe(node);

			if (observeParent && node.parentElement) {
				resizeObserver.observe(node.parentElement);
			}

			if (observeChildren) {
				for (const child of node.children) {
					resizeObserver.observe(child);
				}
			}

			updateOverflow();
		};

		observeResizeTargets();

		const mutationObserver = observeChildren
			? new MutationObserver(observeResizeTargets)
			: null;
		mutationObserver?.observe(node, { childList: true });

		node.addEventListener("scroll", updateOverflow, { passive: true });
		window.addEventListener("resize", updateOverflow);

		return () => {
			resizeObserver.disconnect();
			mutationObserver?.disconnect();
			node.removeEventListener("scroll", updateOverflow);
			window.removeEventListener("resize", updateOverflow);
		};
	}, [observeChildren, observeParent, updateOverflow]);

	return {
		ref,
		...state,
	};
}
