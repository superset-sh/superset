import { useEffect, useState } from "react";

/**
 * Resolves a portal slot element mounted by a parent layout. The slot is
 * usually in the DOM before this child renders, so look it up synchronously
 * during state init — otherwise persisted-open portals flash for a frame
 * while the post-mount effect fills the ref.
 */
export function useSlotElement(id: string): HTMLElement | null {
	const [slotEl, setSlotEl] = useState<HTMLElement | null>(() =>
		typeof document !== "undefined" ? document.getElementById(id) : null,
	);
	useEffect(() => {
		if (slotEl?.id === id) return;
		setSlotEl(document.getElementById(id));
	}, [slotEl, id]);
	return slotEl;
}
