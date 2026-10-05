import { useEffect, useState } from "react";

const BLOCK_FADE_MS = 320;

/** True while text is arriving, and for one fade after, so the last block finishes. */
export function useBlockFading(active: boolean): boolean {
	const [lingering, setLingering] = useState(active);
	useEffect(() => {
		if (active) {
			setLingering(true);
			return;
		}
		const timer = window.setTimeout(() => setLingering(false), BLOCK_FADE_MS);
		return () => window.clearTimeout(timer);
	}, [active]);
	return active || lingering;
}
