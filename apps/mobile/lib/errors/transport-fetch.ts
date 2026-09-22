import { rawErrorMessage } from "@superset/i18n/errors";

/**
 * A request that never got a server response.
 *
 * tRPC reports this itself — a `TRPCClientError` with no `data` — so its
 * clients need nothing here. better-auth's fetch rejects with whatever the
 * platform threw, which on iOS is Expo's opaque `UnexpectedException`, so its
 * failures are wrapped instead. The `catch` is around our own `fetch` call,
 * which makes the classification structural: transport by construction, not
 * by inspecting a message.
 */
export class TransportError extends Error {
	constructor(cause: unknown) {
		// Carry the platform's text for logs and Sentry grouping. It is never
		// displayed — `errorCopy()` answers from the kind instead.
		super(rawErrorMessage(cause) || "transport failure");
		this.name = "TransportError";
		this.cause = cause;
	}
}

/** `fetch`, with every rejection normalized to a `TransportError`. */
export const transportFetch: typeof fetch = async (input, init) => {
	try {
		return await fetch(input, init);
	} catch (cause) {
		throw new TransportError(cause);
	}
};
