import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import * as Sentry from "@sentry/react-native";
import { i18n } from "@superset/i18n";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { Alert } from "react-native";

/**
 * A failure that happened in transport: the request never reached a server, or
 * the answer never came back. The outcome is therefore unknown — the work may
 * have completed anyway.
 */
export type TransportFailureKind =
	| "connection-lost"
	| "timed-out"
	| "offline"
	| "unreachable";

/**
 * Expo's fetch prefixes every rejection with `fetch failed: ` (expo/src/winter/
 * fetch/FetchErrors.ts); React Native's XHR-backed fetch says `Network request
 * failed`. Both mean the same thing and neither is localized, so this is the
 * definition of "transport failure" — not the description text below.
 */
const TRANSPORT_SIGNATURE = /fetch failed:|network request failed/;

/**
 * Refines the kind. iOS hands Expo an NSError and `UnexpectedException` keeps
 * only its `localizedDescription` (expo-modules-core/ios/Core/Exceptions/
 * UnexpectedException.swift), so the NSURLError code — -1005, -1001, -1009 —
 * does not survive into JavaScript and the kind has to be read off the text.
 * iOS localizes that text, so a non-English device falls through to
 * `unreachable`; its copy has to stand on its own for that reason.
 */
const KIND_SIGNATURES: readonly [TransportFailureKind, RegExp][] = [
	// -1009 NSURLErrorNotConnectedToInternet
	["offline", /internet connection appears to be offline/],
	// -1001 NSURLErrorTimedOut
	["timed-out", /request timed out/],
	// -1005 NSURLErrorNetworkConnectionLost
	["connection-lost", /network connection was lost/],
];

/**
 * An internal frame that must never reach a user: `(at ExpoModulesCore/
 * Promise.swift:56)`, a bare exception class name, a bundler path. Applied as
 * a backstop to messages this module would otherwise pass through, so a leak
 * shape nobody has seen yet still degrades to the generic copy.
 */
const INTERNAL_FRAME = /\(at [^\s)]+:\d+\)|ExpoModulesCore|[A-Z]\w*Exception:/;

const TRANSPORT_COPY: Record<TransportFailureKind, MessageDescriptor> = {
	"connection-lost": msg({ message: "The connection dropped." }),
	"timed-out": msg({ message: "The request timed out." }),
	offline: msg({ message: "No internet connection." }),
	unreachable: msg({ message: "Could not reach the server." }),
};

// Deliberately the same message id `errorMessage()` already falls back to, so
// it is translated in every catalog rather than adding a near-duplicate.
const GENERIC = msg({ message: "Something went wrong. Please try again." });

/** Every message in the `cause` chain, lowercased, for signature matching. */
function chainText(error: unknown): string {
	const seen = new Set<unknown>();
	const parts: string[] = [];
	let current: unknown = error;
	while (current && !seen.has(current)) {
		seen.add(current);
		parts.push(rawErrorMessage(current));
		current = (current as { cause?: unknown }).cause;
	}
	return parts.join(" ").toLowerCase();
}

/**
 * The transport failure behind an error, or null when the server did answer
 * and the error is its own. Callers that distinguish "this definitely failed"
 * from "we never found out" branch on null.
 */
export function transportFailureKind(
	error: unknown,
): TransportFailureKind | null {
	const text = chainText(error);
	if (!TRANSPORT_SIGNATURE.test(text)) return null;
	for (const [kind, signature] of KIND_SIGNATURES) {
		if (signature.test(text)) return kind;
	}
	return "unreachable";
}

/** Whether the outcome of the request is unknown rather than known-failed. */
export function isTransportError(error: unknown): boolean {
	return transportFailureKind(error) !== null;
}

/**
 * What to show a user for a caught error. A transport failure becomes plain
 * copy; anything else keeps the server's own message, which is usually the
 * useful part (GitHub's reason for refusing a merge, a host's refusal to
 * delete). Never an Expo or Swift frame either way.
 */
export function errorCopy(error: unknown): string {
	const kind = transportFailureKind(error);
	if (kind) return i18n._(TRANSPORT_COPY[kind]);
	// Matched on the raw message, never on errorMessage() output: that is
	// display-only and potentially translated (AGENTS.md, packages/i18n).
	if (INTERNAL_FRAME.test(rawErrorMessage(error))) return i18n._(GENERIC);
	return errorMessage(error);
}

/**
 * Route a caught error to diagnostics. Always the raw error, never
 * `errorCopy()` — logs and Sentry grouping need stable English.
 *
 * A transport failure is a breadcrumb rather than an event: a phone losing its
 * connection is not a bug, and the volume is exactly what exhausted the Sentry
 * quota in August. It still rides along on whatever is captured next.
 */
export function captureError(error: unknown, scope: string): void {
	console.error(`[${scope}]`, error);
	const kind = transportFailureKind(error);
	if (kind) {
		Sentry.addBreadcrumb({
			category: "transport",
			level: "warning",
			message: `${scope}: ${kind}`,
			data: { raw: rawErrorMessage(error) },
		});
		return;
	}
	Sentry.captureException(error, { tags: { scope } });
}

/**
 * The one way to tell a user an action failed: a translated title, a body that
 * is safe to show, and the real error sent to diagnostics. `scope` names the
 * action for Sentry — `"workspace.create"`, `"terminal.send"`.
 */
export function alertError(
	title: MessageDescriptor,
	error: unknown,
	scope: string,
): void {
	captureError(error, scope);
	Alert.alert(i18n._(title), errorCopy(error));
}
