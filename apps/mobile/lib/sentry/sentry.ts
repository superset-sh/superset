import * as Sentry from "@sentry/react-native";
import { env } from "../env";

export function initSentry() {
	if (!env.EXPO_PUBLIC_SENTRY_DSN_MOBILE || env.NODE_ENV !== "production") {
		return;
	}
	Sentry.init({
		dsn: env.EXPO_PUBLIC_SENTRY_DSN_MOBILE,
		environment: env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
		tracesSampleRate: 0,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		sendDefaultPii: false,
	});
}
