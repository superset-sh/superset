import "react-native-get-random-values"; // MUST BE FIRST IMPORT
// Before anything can render a plural — Hermes ships a partial Intl.
import "@/lib/intl-polyfills";
import "../global.css";

import * as Sentry from "@sentry/react-native";
import * as SplashScreen from "expo-splash-screen";
import { initSentry } from "@/lib/sentry";
import { RootLayout } from "@/screens/RootLayout";

initSentry();

// Held here, before the first render, or expo-router hides it on
// navigation-ready. RootLayout decides when to let it go; this timer only
// guarantees that an early crash cannot strand anyone on it, since the public
// preventAutoHideAsync installs no error handler of its own.
const SPLASH_BACKSTOP_MS = 5000;
void SplashScreen.preventAutoHideAsync().catch(() => {});
setTimeout(
	() => void SplashScreen.hideAsync().catch(() => {}),
	SPLASH_BACKSTOP_MS,
);

export default Sentry.wrap(RootLayout);
