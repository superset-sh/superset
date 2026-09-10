import * as SplashScreen from "expo-splash-screen";

/**
 * The native splash is held from launch until the first screen has something
 * to show, so boot and load are one image rather than two.
 *
 * Hiding is safe from anywhere: on Home the identical `HomeSplash` sits
 * underneath, and every other route renders its own content. The backstop is
 * the guarantee that no missed path can leave someone on a splash forever.
 */
const BACKSTOP_MS = 5000;

let hidden = false;

export function hideSplash(): void {
	if (hidden) return;
	hidden = true;
	void SplashScreen.hideAsync().catch(() => {});
}

export function holdSplash(): void {
	void SplashScreen.preventAutoHideAsync().catch(() => {});
	setTimeout(hideSplash, BACKSTOP_MS);
}
