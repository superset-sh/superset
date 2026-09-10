import "react-native-get-random-values"; // MUST BE FIRST IMPORT
// Before anything can render a plural — Hermes ships a partial Intl.
import "@/lib/intl-polyfills";
import "../global.css";

import * as Sentry from "@sentry/react-native";
import { initSentry } from "@/lib/sentry";
import { holdSplash } from "@/lib/splash";
import { RootLayout } from "@/screens/RootLayout";

initSentry();
// Before the first render, or expo-router hides it on navigation-ready.
holdSplash();

export default Sentry.wrap(RootLayout);
