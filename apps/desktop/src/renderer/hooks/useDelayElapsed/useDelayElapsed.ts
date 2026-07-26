import { useEffect, useState } from "react";

/** True once `active` has stayed true for `delayMs`; resets when `active` drops. */
export function useDelayElapsed(active: boolean, delayMs: number): boolean {
	const [elapsed, setElapsed] = useState(false);

	useEffect(() => {
		if (!active) {
			setElapsed(false);
			return;
		}
		const timer = window.setTimeout(() => setElapsed(true), delayMs);
		return () => window.clearTimeout(timer);
	}, [active, delayMs]);

	return elapsed;
}
