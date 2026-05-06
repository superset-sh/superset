import { useEffect, useState } from "react";

/**
 * A Date that re-renders on a cadence so `formatDistance`-style displays
 * keep ticking. Defaults to 1s so fresh rows never show a stale delta.
 */
export function useNow(intervalMs = 1000): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
	return now;
}
