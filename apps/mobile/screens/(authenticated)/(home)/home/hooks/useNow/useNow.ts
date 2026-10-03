import { useEffect, useState } from "react";

export function useNow(intervalMs: number): Date {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const interval = setInterval(() => setNow(new Date()), intervalMs);
		return () => clearInterval(interval);
	}, [intervalMs]);
	return now;
}
