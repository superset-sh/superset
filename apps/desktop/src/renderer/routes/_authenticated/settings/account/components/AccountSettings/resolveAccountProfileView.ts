/**
 * Profile fields the account settings UI needs to render a user.
 *
 * Both the persisted `users` Electric collection row (`SelectUser`) and the
 * authenticated better-auth session user satisfy this shape.
 */
export interface AccountProfileUser {
	name: string;
	email: string;
	image: string | null;
}

/** The minimal slice of the better-auth session user we rely on. */
export interface AccountSessionUser {
	id?: string;
	name?: string | null;
	email?: string | null;
	image?: string | null;
}

export type AccountProfileView =
	| { kind: "loading" }
	| { kind: "profile"; user: AccountProfileUser }
	| { kind: "unavailable" };

export interface ResolveAccountProfileViewInput {
	/** The authenticated session user, or null/undefined while it resolves. */
	sessionUser: AccountSessionUser | null | undefined;
	/** The current user's row from the `users` collection, if it has synced. */
	collectionUser: AccountProfileUser | undefined;
}

/**
 * Decide what the account profile section should render.
 *
 * The persisted `users` collection is the freshest source, but it can stall
 * short of `isReady` (Electric sync errors, cold cache). When it hasn't
 * delivered the current user's row we fall back to the authenticated session
 * user, which already carries the profile fields — so a signed-in user always
 * sees their profile instead of an indefinite skeleton.
 */
export function resolveAccountProfileView({
	sessionUser,
	collectionUser,
}: ResolveAccountProfileViewInput): AccountProfileView {
	// Cache-first: prefer the freshest collection row, but fall back to the
	// authenticated session user so a signed-in user always sees their profile
	// even if the `users` collection stalls short of `isReady`.
	const user = collectionUser ?? sessionUserToProfile(sessionUser);
	if (user) {
		return { kind: "profile", user };
	}

	// No profile data anywhere yet. Keep the skeleton only while data could
	// still arrive — the session is still resolving. Once the session has
	// resolved without a user there is nothing more to wait for.
	if (sessionUser === undefined) {
		return { kind: "loading" };
	}
	return { kind: "unavailable" };
}

function sessionUserToProfile(
	sessionUser: AccountSessionUser | null | undefined,
): AccountProfileUser | undefined {
	// The session user only counts as renderable once it carries an email
	// (better-auth users always have one); otherwise treat it as absent.
	if (!sessionUser?.email) {
		return undefined;
	}
	return {
		name: sessionUser.name ?? "",
		email: sessionUser.email,
		image: sessionUser.image ?? null,
	};
}
