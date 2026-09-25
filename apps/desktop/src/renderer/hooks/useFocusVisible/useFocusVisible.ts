import { type FocusEvent, useCallback, useState } from "react";

/**
 * Tracks whether the element these handlers are spread onto (or one of its
 * descendants) holds keyboard-originated focus. A `mousedown` on a
 * `tabIndex={0}` row focuses it too, so a plain onFocus/onBlur pair can't
 * tell a click-to-select apart from Tab navigation — `:focus-visible`
 * already makes that distinction natively (browsers exclude pointer-
 * triggered focus from it), so this just reads it at focus time instead of
 * reimplementing the heuristic.
 *
 * Focus is treated as "within" for as long as it stays inside the element
 * (e.g. tabbing from the row onto a child action button it reveals), and
 * only clears once `relatedTarget` lands outside it.
 */
export function useFocusVisible() {
	const [isFocusVisible, setIsFocusVisible] = useState(false);

	const onFocus = useCallback((event: FocusEvent<HTMLElement>) => {
		if (event.target.matches(":focus-visible")) {
			setIsFocusVisible(true);
		}
	}, []);

	const onBlur = useCallback((event: FocusEvent<HTMLElement>) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
			setIsFocusVisible(false);
		}
	}, []);

	return { isFocusVisible, onFocus, onBlur };
}
