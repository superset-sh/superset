import { env } from "@/env";
import { createSignedState } from "@/lib/oauth-state";

/**
 * The cookie an OAuth round-trip is bound to. `path` keeps it on the flow's
 * own routes, so it rides the provider's redirect back and nothing else.
 */
export type StateCookie = { readonly name: string; readonly path: string };

/**
 * Every flow's state cookie in one place, so the route that starts a flow and
 * the route that finishes it cannot drift apart. A new callback picks one from
 * here, which is what makes it bound rather than remembering to be.
 */
export const STATE_COOKIES = {
	github: { name: "github_oauth_state", path: "/api/github" },
	google: { name: "google_oauth_state", path: "/api/integrations/google" },
	linear: { name: "linear_oauth_state", path: "/api/integrations/linear" },
	notion: { name: "notion_oauth_state", path: "/api/integrations/notion" },
	slack: { name: "slack_oauth_state", path: "/api/integrations/slack" },
	sentry: { name: "sentry_oauth_state", path: "/api/integrations/sentry" },
	microsoftTeams: {
		name: "microsoft_teams_oauth_state",
		path: "/api/integrations/microsoft-teams",
	},
	// The sign-in leg gets its own cookie: it is minted inside the consent
	// callback, which expires the consent cookie in the same redirect.
	microsoftTeamsIdentity: {
		name: "microsoft_teams_identity_oauth_state",
		path: "/api/integrations/microsoft-teams/identity",
	},
	connectors: { name: "connector_oauth_state", path: "/api/connectors" },
} as const satisfies Record<string, StateCookie>;

/** Matches the signed state's own TTL; both are one-shot. */
const MAX_AGE_SECONDS = 600;

function attributes(cookie: StateCookie): string {
	const secure = env.NEXT_PUBLIC_API_URL.startsWith("https") ? " Secure;" : "";
	return `HttpOnly;${secure} SameSite=Lax; Path=${cookie.path}`;
}

export function setStateCookie(cookie: StateCookie, state: string): string {
	return `${cookie.name}=${state}; ${attributes(cookie)}; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearStateCookie(cookie: StateCookie): string {
	return `${cookie.name}=; ${attributes(cookie)}; Max-Age=0`;
}

export function readStateCookie(
	request: Request,
	cookie: StateCookie,
): string | null {
	const header = request.headers.get("cookie");
	if (!header) return null;
	for (const part of header.split(";")) {
		const [key, ...rest] = part.trim().split("=");
		if (key?.trim() === cookie.name) return rest.join("=");
	}
	return null;
}

/**
 * Leaves a flow: redirects, and expires its one-shot state cookie so a
 * callback that ended early cannot leave a live state behind for its TTL.
 * `resolveCallback` routes every one of its exits through this.
 */
export function exitOAuthFlow(cookie: StateCookie, location: string): Response {
	return new Response(null, {
		status: 302,
		headers: { Location: location, "Set-Cookie": clearStateCookie(cookie) },
	});
}

export type BeginOAuthFlowOptions = {
	/** Where the state is stashed for the callback to match the answer against. */
	cookie: StateCookie;
	/** Who the flow acts for; `createSignedState` adds the timestamp. */
	payload: Record<string, unknown>;
	/** The provider URL to send the browser to, built from the signed state. */
	authorizeUrl: (state: string) => string | Promise<string>;
	/** State cookies from an earlier leg to expire in the same response. */
	clear?: readonly StateCookie[];
};

/**
 * Starts a provider round-trip.
 *
 * The signed state says which organization asked, and on its own says nothing
 * about who is *answering*. Anyone could mint one for their own organization,
 * hand the provider link to someone else, and have that person's grant — their
 * repositories, their mailbox, their workspace — recorded against theirs
 * (GHSA-2cp5-f6gg-w5fp). So minting the state and binding it to the browser
 * that asked is one operation, and `resolveCallback` refuses a state the
 * answering request's cookie does not carry.
 */
export async function beginOAuthFlow(
	options: BeginOAuthFlowOptions,
): Promise<Response> {
	const state = createSignedState(options.payload);
	const headers = new Headers({ Location: await options.authorizeUrl(state) });
	headers.append("Set-Cookie", setStateCookie(options.cookie, state));
	for (const stale of options.clear ?? []) {
		headers.append("Set-Cookie", clearStateCookie(stale));
	}
	return new Response(null, { status: 302, headers });
}
