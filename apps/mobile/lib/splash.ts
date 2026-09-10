import * as SplashScreen from "expo-splash-screen";

/**
 * The native splash is held from launch until the first screen has something
 * to show, so boot and load are one image rather than two.
 *
 * The backstop is why nothing can strand someone on it: the public
 * preventAutoHideAsync, unlike expo-router's internal one, installs no error
 * handler to hide the splash on an uncaught exception.
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
