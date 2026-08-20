import { findOrgMembership } from "@superset/db/utils";

import { verifySignedState } from "@/lib/oauth-state";

type ResolveCallbackOptions<Name extends string> = {
	/** Query params (besides `state`) the provider must send back. */
	params: readonly Name[];
	/** Builds the provider's error redirect for a failure reason. */
	redirect: (error: string) => Response;
	/** Error value when the provider reports a denial (default "oauth_denied"). */
	denied?: string;
	/**
	 * Where the state token travels when not in the `state` query param
	 * (Sentry carries it in a first-party cookie). Missing then means
	 * `invalid_state`, not `missing_params`.
	 */
	stateFrom?: (request: Request) => string | null;
};

export type CallbackContext<Name extends string> = {
	organizationId: string;
	userId: string;
	url: URL;
	params: Record<Name, string>;
};

/**
 * The callback-route preamble: provider denial, required params, signed-state
 * verification, and membership re-verified at callback time (the state was
 * signed earlier). Returns the provider's error redirect when a check fails.
 */
export async function resolveCallback<Name extends string>(
	request: Request,
	options: ResolveCallbackOptions<Name>,
): Promise<CallbackContext<Name> | Response> {
	const url = new URL(request.url);
	if (url.searchParams.get("error")) {
		return options.redirect(options.denied ?? "oauth_denied");
	}

	const params = {} as Record<Name, string>;
	for (const name of options.params) {
		const value = url.searchParams.get(name);
		if (!value) return options.redirect("missing_params");
		params[name] = value;
	}

	const state = options.stateFrom
		? options.stateFrom(request)
		: url.searchParams.get("state");
	if (!state && !options.stateFrom) return options.redirect("missing_params");

	const stateData = state ? verifySignedState(state) : null;
	if (!stateData) return options.redirect("invalid_state");
	const { organizationId, userId } = stateData;

	const membership = await findOrgMembership({ userId, organizationId });
	if (!membership) {
		console.error("[integrations] callback membership verification failed:", {
			organizationId,
			userId,
		});
		return options.redirect("unauthorized");
	}

	return { organizationId, userId, url, params };
}
