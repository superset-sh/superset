import { useEffect, useRef } from "react";

/** Scrolls the referenced container back to the top whenever `trigger` changes. */
export function useScrollReset<T extends HTMLElement>(trigger: unknown) {
	const ref = useRef<T>(null);
	// biome-ignore lint/correctness/useExhaustiveDependencies: trigger is the reset signal, not read in the body
	useEffect(() => {
		ref.current?.scrollTo({ top: 0 });
	}, [trigger]);
	return ref;
}
