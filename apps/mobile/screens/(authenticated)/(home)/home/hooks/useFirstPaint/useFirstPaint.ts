import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";

// Sized to the wait it covers (hydration plus the API and relay round trips),
// not to the unbounded worst case — a host the API still calls online answers
// whenever it answers, and the tRPC client sets no timeout. Holding longer
// would withhold the header and composer, which are live before the rows are.
const TIMEOUT_MS = 1200;

/**
 * Whether Home has earned its first paint, and the release of the native
 * splash that comes with it.
 *
 * Latches: this gates the first paint and nothing after it. An organization
 * switch re-pends the same queries, and blanking a list someone is reading
 * would be worse than a stale row.
 */
export function useFirstPaint(ready: boolean): boolean {
	const [painted, setPainted] = useState(false);

	useEffect(() => {
		if (painted) {
			void SplashScreen.hideAsync().catch(() => {});
			return;
		}
		if (ready) {
			setPainted(true);
			return;
		}
		const timer = setTimeout(() => setPainted(true), TIMEOUT_MS);
		return () => clearTimeout(timer);
	}, [ready, painted]);

	return painted;
}
