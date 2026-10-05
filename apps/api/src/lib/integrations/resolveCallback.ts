import { findOrgMembership } from "@superset/db/utils";

import { verifySignedState } from "@/lib/oauth-state";
import { exitOAuthFlow, readStateCookie, type StateCookie } from "./oauthFlow";

type ResolveCallbackOptions<Name extends string> = {
	/** Query params (besides `state`) the provider must send back. */
	params: readonly Name[];
	/** Where a failed check sends the browser. */
	redirect: (error: string) => string;
	/** Error value when the provider reports a denial (default "oauth_denied"). */
	denied?: string;
	/** The cookie `beginOAuthFlow` bound this flow's state to. */
	cookie: StateCookie;
	/**
	 * For a flow the provider answers with no state of ours (an app install):
	 * the cookie is then the only copy, so holding it *is* the binding.
	 */
	stateInCookieOnly?: boolean;
};

export type CallbackContext<Name extends string> = {
	organizationId: string;
	userId: string;
	url: URL;
	params: Record<Name, string>;
	/** The raw state token, for a flow carrying more than the identity. */
	state: string;
	/** Redirect to `location`, expiring the flow's one-shot state cookie. */
	exit: (location: string) => Response;
	/** `exit` to the failure destination for `error`. */
	fail: (error: string) => Response;
};

/**
 * The callback-route preamble: provider denial, required params, the state
 * bound to the browser that started the flow, signed-state verification, and
 * membership re-verified at callback time (the state was signed earlier).
 * Returns the provider's error redirect when a check fails.
 *
 * Every exit clears the state cookie — including the route's own, through
 * `exit`/`fail` — so one failed callback cannot leave a live state behind for
 * the rest of its TTL.
 */
export async function resolveCallback<Name extends string>(
	request: Request,
	options: ResolveCallbackOptions<Name>,
): Promise<CallbackContext<Name> | Response> {
	const url = new URL(request.url);
	const exit = (location: string) => exitOAuthFlow(options.cookie, location);
	const fail = (error: string) => exit(options.redirect(error));

	if (url.searchParams.get("error")) {
		return fail(options.denied ?? "oauth_denied");
	}

	const params = {} as Record<Name, string>;
	for (const name of options.params) {
		const value = url.searchParams.get(name);
		if (!value) return fail("missing_params");
		params[name] = value;
	}

	// The state proves who asked, the cookie proves who is answering. Without
	// the second half, a grant a victim approves pairs with a state an attacker
	// minted and the connection lands in the attacker's organization
	// (GHSA-2cp5-f6gg-w5fp).
	const bound = readStateCookie(request, options.cookie);
	const state = options.stateInCookieOnly
		? bound
		: url.searchParams.get("state");
	if (!state) {
		return fail(options.stateInCookieOnly ? "invalid_state" : "missing_params");
	}
	if (!options.stateInCookieOnly && state !== bound) {
		console.error("[integrations] callback state is not bound to this browser");
		return fail("invalid_state");
	}

	const stateData = verifySignedState(state);
	if (!stateData) return fail("invalid_state");
	const { organizationId, userId } = stateData;

	const membership = await findOrgMembership({ userId, organizationId });
	if (!membership) {
		console.error("[integrations] callback membership verification failed:", {
			organizationId,
			userId,
		});
		return fail("unauthorized");
	}

	return { organizationId, userId, url, params, state, exit, fail };
}
