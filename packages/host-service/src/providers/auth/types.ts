import type {
	AuthSessionExpiredMessage,
	AuthSessionRestoredMessage,
} from "../../events/types";

export interface AuthSessionEventPublisher {
	broadcastAuthSessionExpired(
		message: Omit<AuthSessionExpiredMessage, "type">,
	): void;
	broadcastAuthSessionRestored(
		message: Omit<AuthSessionRestoredMessage, "type">,
	): void;
}

export interface ApiAuthProvider {
	getHeaders(): Promise<Record<string, string>>;
	/**
	 * Drop any cached credentials so the next `getHeaders()` call re-derives
	 * them from the underlying source. The cloud trpc client calls this on
	 * 401 to recover from stale-credential cases (JWT expired, session
	 * rotated, JWKS rolled).
	 */
	invalidateCache(): void;
	isInAnyExpiredState?(): boolean;
	isInExpiredState?(): boolean;
	setEventBus?(eventBus: AuthSessionEventPublisher): void;
}
