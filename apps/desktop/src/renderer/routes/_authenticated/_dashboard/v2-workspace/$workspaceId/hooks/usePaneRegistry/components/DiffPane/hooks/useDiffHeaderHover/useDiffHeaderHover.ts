import { type RefObject, useEffect, useState } from "react";

export function useDiffHeaderHover(
	targetRef: RefObject<HTMLElement | null>,
): boolean {
	const [headerHovered, setHeaderHovered] = useState(false);

	useEffect(() => {
		const show = () => setHeaderHovered(true);
		const hide = () => setHeaderHovered(false);
		let header: Element | null = null;
		let target: HTMLElement | null = null;
		let frame = 0;
		const connect = () => {
			target = targetRef.current;
			header =
				target
					?.closest("diffs-container")
					?.shadowRoot?.querySelector("[data-diffs-header='default']") ?? null;
			if (!header) {
				frame = requestAnimationFrame(connect);
				return;
			}
			header.addEventListener("pointerenter", show);
			header.addEventListener("pointerleave", hide);
			target?.addEventListener("focusin", show);
			target?.addEventListener("focusout", hide);
			setHeaderHovered(header.matches(":hover"));
		};
		connect();
		return () => {
			cancelAnimationFrame(frame);
			header?.removeEventListener("pointerenter", show);
			header?.removeEventListener("pointerleave", hide);
			target?.removeEventListener("focusin", show);
			target?.removeEventListener("focusout", hide);
		};
	}, [targetRef]);

	return headerHovered;
}
