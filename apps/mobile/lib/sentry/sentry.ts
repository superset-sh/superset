import * as Sentry from "@sentry/react-native";
import { env } from "../env";
import { isTransportError } from "../errors";

export function initSentry() {
	if (!env.EXPO_PUBLIC_SENTRY_DSN_MOBILE || env.NODE_ENV !== "production") {
		return;
	}
	Sentry.init({
		dsn: env.EXPO_PUBLIC_SENTRY_DSN_MOBILE,
		environment: env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
		replaysSessionSampleRate: 0,
		replaysOnErrorSampleRate: 0,
		sendDefaultPii: false,
		// A phone losing its connection is not a bug, and the volume of it is
		// what exhausted the quota in August. The request itself is still on the
		// event as a breadcrumb (breadcrumbsIntegration is on by default), so
		// anything that does get reported still shows the drop that preceded it.
		beforeSend: (event, hint) =>
			isTransportError(hint?.originalException) ? null : event,
	});
}
