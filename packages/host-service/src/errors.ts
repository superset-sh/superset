export const AUTH_REFRESH_FAILED_MESSAGE =
	"Superset session expired — run `superset auth login`";

export type AuthRefreshFailureReason =
	| "invalid_grant"
	| "network_error"
	| "http_error";

export interface AuthRefreshFailedErrorOptions {
	reason: AuthRefreshFailureReason;
	statusCode?: number;
}

export class AuthRefreshFailedError extends Error {
	readonly reason: AuthRefreshFailureReason;
	readonly statusCode?: number;

	constructor(options: AuthRefreshFailedErrorOptions) {
		super(AUTH_REFRESH_FAILED_MESSAGE);
		this.name = "AuthRefreshFailedError";
		this.reason = options.reason;
		if (options.statusCode !== undefined) {
			this.statusCode = options.statusCode;
		}
	}
}
