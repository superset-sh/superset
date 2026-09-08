import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import * as Sentry from "@sentry/react-native";
import { i18n } from "@superset/i18n";
import { errorMessage, rawErrorMessage } from "@superset/i18n/errors";
import { TRPCClientError } from "@trpc/client";
import * as Network from "expo-network";
import { Alert } from "react-native";
import { TransportError } from "./transport-fetch";

/**
 * A failure that never got a server response, so the outcome is unknown — the
 * work may have completed anyway.
 */
export type TransportFailureKind = "offline" | "unreachable";

/**
 * Latest reachability, kept current by a listener so the classifier can stay
 * synchronous. Started at import like the PostHog client's super properties:
 * the first failure can arrive before any provider effect has run.
 *
 * `isInternetReachable` is tri-state — undefined means "not determined yet",
 * and only an explicit false is offline.
 */
let deviceOffline = false;
Network.addNetworkStateListener((state) => {
	deviceOffline = state.isInternetReachable === false;
});
void Network.getNetworkStateAsync()
	.then((state) => {
		deviceOffline = state.isInternetReachable === false;
	})
	.catch(() => {
		// Reachability is a refinement, not a gate: without it every transport
		// failure simply reads as "could not reach the server".
	});

/**
 * The transport failure behind an error, or null when the server did answer
 * and the error is its own.
 *
 * tRPC only populates `data` from a parsed error envelope, so its absence
 * means the transport failed rather than the server refusing. That is the
 * whole check — the same predicate the desktop's host-service links use
 * (`isConnectionError` in packages/workspace-client/src/lib/hostServiceLinks).
 *
 * It has to be structural, because iOS tells us nothing else. Expo rejects a
 * failed fetch with URLSession's raw NSError (ExpoFetchModule.swift), and
 * `Promise.reject` wraps any non-Exception in `UnexpectedException`, which
 * keeps only `localizedDescription` (expo-modules-core Promise.swift:57). The
 * NSURLError code — -1005, -1001, -1009 — never reaches JavaScript, and the
 * description that does is localized by iOS. There is nothing there to read.
 */
export function transportFailureKind(
	error: unknown,
): TransportFailureKind | null {
	const transport =
		error instanceof TransportError ||
		(error instanceof TRPCClientError && error.data == null);
	if (!transport) return null;
	return deviceOffline ? "offline" : "unreachable";
}

/** Whether the outcome of the request is unknown rather than known-failed. */
export function isTransportError(error: unknown): boolean {
	return transportFailureKind(error) !== null;
}

/**
 * An error thrown by an Expo native module rather than by our server. Its
 * message is the Swift exception's debugDescription — "UnexpectedException:
 * … (at ExpoModulesCore/Promise.swift:56)" — which is a diagnostic, never
 * user copy. Every Expo exception carries an `ERR_*` code (see
 * `errorCodeFromString` in expo-modules-core CodedError.swift), so one is
 * identifiable without reading the message.
 */
function isExpoNativeError(error: unknown): boolean {
	const code = (error as { code?: unknown } | null | undefined)?.code;
	return typeof code === "string" && code.startsWith("ERR_");
}

const TRANSPORT_COPY: Record<TransportFailureKind, MessageDescriptor> = {
	offline: msg({ message: "No internet connection." }),
	unreachable: msg({ message: "Could not reach the server." }),
};

// Deliberately the same message id `errorMessage()` already falls back to, so
// it is translated in every catalog rather than adding a near-duplicate.
const GENERIC = msg({ message: "Something went wrong. Please try again." });

/**
 * What to show a user for a caught error. A transport failure becomes plain
 * copy; anything else keeps the server's own message, which is usually the
 * useful part (GitHub's reason for refusing a merge, a host's refusal to
 * delete).
 */
export function errorCopy(error: unknown): string {
	const kind = transportFailureKind(error);
	if (kind) return i18n._(TRANSPORT_COPY[kind]);
	if (isExpoNativeError(error)) return i18n._(GENERIC);
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
