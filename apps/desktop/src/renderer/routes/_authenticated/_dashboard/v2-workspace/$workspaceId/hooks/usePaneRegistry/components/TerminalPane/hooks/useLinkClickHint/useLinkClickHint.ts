import { useCallback, useEffect, useRef, useState } from "react";

export interface LinkClickHint {
	clientX: number;
	clientY: number;
}

const HINT_DURATION_MS = 2000;
const MAX_HINTS_PER_SESSION = 2;

let hintsRemaining = MAX_HINTS_PER_SESSION;

export function useLinkClickHint() {
	const [hint, setHint] = useState<LinkClickHint | null>(null);
	const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const showHint = useCallback((clientX: number, clientY: number) => {
		if (hintsRemaining <= 0) return;
		hintsRemaining -= 1;
		if (timeoutRef.current) clearTimeout(timeoutRef.current);
		setHint({ clientX, clientY });
		timeoutRef.current = setTimeout(() => {
			setHint(null);
			timeoutRef.current = null;
		}, HINT_DURATION_MS);
	}, []);

	useEffect(() => {
		return () => {
			if (timeoutRef.current) clearTimeout(timeoutRef.current);
		};
	}, []);

	return { hint, showHint };
}
