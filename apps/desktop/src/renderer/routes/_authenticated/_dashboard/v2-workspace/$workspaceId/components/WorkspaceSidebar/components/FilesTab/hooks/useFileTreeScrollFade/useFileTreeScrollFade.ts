import { useLayoutEffect, useRef } from "react";

const FADE_SIZE = "1.5rem";
const SCROLLER_SELECTOR = '[data-file-tree-virtualized-scroll="true"]';

function buildMask(top: boolean, bottom: boolean): string {
	if (!top && !bottom) return "";
	return `linear-gradient(to bottom, transparent, black ${top ? FADE_SIZE : "0px"}, black calc(100% - ${bottom ? FADE_SIZE : "0px"}), transparent)`;
}

/**
 * Edge-fades the Pierre file tree while it has hidden scrollable content.
 * The tree's scroller lives inside the `file-tree-container` web component's
 * shadow root, where the shared `fade-edge-*` utilities can't reach, so this
 * mirrors packages/ui fade-edge.css as an inline mask on that scroller.
 */
export function useFileTreeScrollFade<T extends HTMLElement>(enabled: boolean) {
	const containerRef = useRef<T>(null);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container || !enabled) return;

		let scroller: HTMLElement | null = null;

		const update = () => {
			if (!scroller) return;
			const maxScrollTop = scroller.scrollHeight - scroller.clientHeight;
			const mask = buildMask(
				scroller.scrollTop > 1,
				scroller.scrollTop < maxScrollTop - 1,
			);
			scroller.style.maskImage = mask;
			scroller.style.setProperty("-webkit-mask-image", mask);
		};

		const resizeObserver = new ResizeObserver(update);

		const attach = (next: HTMLElement | null) => {
			if (next === scroller) return;
			if (scroller) {
				scroller.removeEventListener("scroll", update);
				resizeObserver.unobserve(scroller);
			}
			scroller = next;
			if (scroller) {
				scroller.addEventListener("scroll", update, { passive: true });
				resizeObserver.observe(scroller);
				update();
			}
		};

		const mutationObserver = new MutationObserver(() => {
			const shadowRoot = container.querySelector(
				"file-tree-container",
			)?.shadowRoot;
			if (!shadowRoot) return;
			attach(shadowRoot.querySelector<HTMLElement>(SCROLLER_SELECTOR));
			update();
		});

		// The shadow root attaches on connect and the scroller mounts (and can
		// remount) as the tree model loads; poll a frame at a time until the
		// shadow root exists, then let the observer track scroller swaps. Row
		// mutations also change scrollHeight without resizing the scroller.
		let raf = 0;
		const init = () => {
			const shadowRoot = container.querySelector(
				"file-tree-container",
			)?.shadowRoot;
			if (!shadowRoot) {
				raf = requestAnimationFrame(init);
				return;
			}
			attach(shadowRoot.querySelector<HTMLElement>(SCROLLER_SELECTOR));
			mutationObserver.observe(shadowRoot, { childList: true, subtree: true });
		};
		init();

		return () => {
			cancelAnimationFrame(raf);
			mutationObserver.disconnect();
			resizeObserver.disconnect();
			scroller?.removeEventListener("scroll", update);
		};
	}, [enabled]);

	return containerRef;
}
