const TRANSIENT_NETWORK_ERROR_PATTERNS = [
	"net::err_internet_disconnected",
	"net::err_network_changed",
	"net::err_connection_refused",
	"net::err_name_not_resolved",
	"net::err_connection_timed_out",
	"net::err_connection_reset",
	"err_network_changed",
	"enotfound",
	"etimedout",
	"econnrefused",
	"econnreset",
] as const;

export function getErrorMessage(error: unknown): string {
	if (typeof error === "string") {
		return error;
	}

	if (error && typeof error === "object") {
		const maybeError = error as {
			message?: unknown;
			code?: unknown;
			cause?: unknown;
		};
		const parts: string[] = [];

		if (typeof maybeError.message === "string") {
			parts.push(maybeError.message);
		}
		if (typeof maybeError.code === "string") {
			parts.push(maybeError.code);
		}
		if (maybeError.cause !== undefined) {
			const causeMessage = getErrorMessage(maybeError.cause);
			if (causeMessage) {
				parts.push(causeMessage);
			}
		}

		if (parts.length > 0) {
			return parts.join(" | ");
		}
	}

	if (error === undefined || error === null) {
		return "";
	}

	return String(error);
}

export function isTransientNetworkErrorMessage(
	message: string | undefined,
): boolean {
	if (!message) {
		return false;
	}
	const normalized = message.toLowerCase();
	return TRANSIENT_NETWORK_ERROR_PATTERNS.some((pattern) =>
		normalized.includes(pattern),
	);
}

export function isTransientNetworkError(error: unknown): boolean {
	return isTransientNetworkErrorMessage(getErrorMessage(error));
}
