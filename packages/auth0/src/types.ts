import type { auth0 } from "./server";

/**
 * Session type inferred from Auth0 SDK
 */
type Auth0Session = Awaited<ReturnType<typeof auth0.getSession>>;

/**
 * Session type that can be null when user is not authenticated
 */
export type AppSession = Auth0Session;

/**
 * Session type when user is authenticated (non-null)
 */
export type SignedInSession = NonNullable<Auth0Session>;

/**
 * Type guard to check if session is authenticated
 */
export function isSignedIn(session: AppSession): session is SignedInSession {
	return session?.user?.sub != null;
}

/**
 * Get the Auth0 user ID from a session
 */
export function getUserId(session: SignedInSession): string {
	return session.user.sub;
}
