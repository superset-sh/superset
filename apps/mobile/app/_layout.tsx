import "react-native-get-random-values"; // MUST BE FIRST IMPORT
// Before anything can render a plural — Hermes has no Intl.PluralRules.
import "@/lib/intl-pluralrules";
import "../global.css";

import * as Sentry from "@sentry/react-native";
import { initSentry } from "@/lib/sentry";
import { RootLayout } from "@/screens/RootLayout";

initSentry();

export default Sentry.wrap(RootLayout);
