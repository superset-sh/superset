/**
 * Browser-side Sentry noise suppression shared by the Next.js apps.
 *
 * Policy: errors thrown by OUR code get fixed, not filtered. These lists only
 * cover code we don't control — browser internals and extension-injected
 * scripts — plus origin patterns for the thirdPartyErrorFilterIntegration
 * belt-and-suspenders. Keep additions rare; the integration (keyed on
 * applicationKey) already drops events with no first-party frames.
 */

export const SENTRY_IGNORE_ERRORS = [
	// Benign browser limitation emitted as a window error event; there is no
	// application call stack to fix.
	"ResizeObserver loop completed with undelivered notifications.",
	"ResizeObserver loop limit exceeded",
	// User-initiated navigation cancelling an in-flight fetch is not a fault,
	// whichever code owned the request.
	"AbortError: The user aborted a request.",
];

export const SENTRY_DENY_URLS = [
	/^chrome-extension:\/\//,
	/^moz-extension:\/\//,
	/^safari-web-extension:\/\//,
	/webkit-masked-url/,
	// Third-party onboarding widget; its fetch failures are not ours.
	/productfruits\.com/,
];
