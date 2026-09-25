interface ScrollToElementOptions {
	/** Center the element in the viewport instead of aligning to the top offset. */
	center?: boolean;
}

/**
 * Animated scroll driven by rAF. Native behavior:"smooth" silently no-ops in
 * some environments (e.g. Chrome with smooth scrolling disabled), so we
 * animate ourselves and jump instantly under prefers-reduced-motion.
 */
export function scrollToElement(
	el: HTMLElement,
	options?: ScrollToElementOptions,
) {
	const rect = el.getBoundingClientRect();
	const offset = options?.center
		? Math.max(24, (window.innerHeight - rect.height) / 2)
		: 96; // matches scroll-mt-24 on the anchor targets
	const max = document.documentElement.scrollHeight - window.innerHeight;
	const target = Math.min(max, Math.max(0, window.scrollY + rect.top - offset));

	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (reduced) {
		window.scrollTo(0, target);
		return;
	}

	const start = window.scrollY;
	const distance = target - start;
	if (Math.abs(distance) < 1) return;

	const duration = Math.min(700, 250 + Math.abs(distance) * 0.06);
	const startedAt = performance.now();
	const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

	let cancelled = false;
	const cancel = () => {
		cancelled = true;
	};
	window.addEventListener("wheel", cancel, { once: true, passive: true });
	window.addEventListener("touchstart", cancel, { once: true, passive: true });

	const step = (now: number) => {
		if (cancelled) return;
		const t = Math.min(1, (now - startedAt) / duration);
		window.scrollTo(0, start + distance * easeOutCubic(t));
		if (t < 1) {
			requestAnimationFrame(step);
		} else {
			window.removeEventListener("wheel", cancel);
			window.removeEventListener("touchstart", cancel);
		}
	};
	requestAnimationFrame(step);
}
