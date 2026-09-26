import type { ConnectorMethod } from "@superset/shared/connectors";
import {
	connectorMethod,
	exchangeCode,
	probeIdentity,
	redirectUriFor,
	requireConnector,
	UnknownConnectorError,
	upsertConnection,
} from "@superset/trpc/connectors";
import { decryptSecret } from "@superset/trpc/integrations/plugins";

import { env } from "@/env";
import { STATE_COOKIES } from "@/lib/integrations/oauthFlow";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { connectorStateSchema, verifySignedState } from "@/lib/oauth-state";

function callbackParams(method: ConnectorMethod): string[] {
	if (method.type === "oauth2") return ["code"];
	if (method.type === "app_install" || method.type === "admin_consent")
		return [...method.callback_params];
	return [];
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ connector: string }> },
) {
	const { connector: slug } = await params;
	// The generic connect page exists for every connector; `/integrations/<slug>`
	// only exists for the seven that predate the registry, so a new connector
	// would 404 the moment someone finished authorizing it.
	const connectUrl = `${env.NEXT_PUBLIC_WEB_URL}/connect/${slug}`;

	let connector: ReturnType<typeof requireConnector>;
	let method: ConnectorMethod;
	try {
		connector = requireConnector(slug);
		method = connectorMethod(connector);
	} catch (error) {
		if (error instanceof UnknownConnectorError)
			return Response.json({ error: "Unknown connector" }, { status: 404 });
		throw error;
	}

	const callback = await resolveCallback(request, {
		params: callbackParams(method),
		redirect: (error) => `${connectUrl}?error=${error}`,
		cookie: STATE_COOKIES.connectors,
		// An app install comes back with no state of ours at all.
		stateInCookieOnly: method.type === "app_install",
	});
	if (callback instanceof Response) return callback;
	const web = (query: string) => callback.exit(`${connectUrl}${query}`);

	try {
		const carried = verifySignedState(callback.state, connectorStateSchema);
		const codeVerifier = carried?.codeVerifier
			? await decryptSecret(carried.codeVerifier)
			: null;

		const tokens = await exchangeCode(slug, method, {
			code: callback.params.code ?? "",
			redirectUri: redirectUriFor(slug),
			codeVerifier,
			params: callback.params,
			issuer: callback.url.searchParams.get("iss"),
		});

		const identity = await probeIdentity(
			slug,
			method,
			tokens.accessToken,
			callback.params,
			tokens.raw,
		);

		const result = await upsertConnection({
			connector,
			slug,
			authMethod: method.type,
			organizationId: callback.organizationId,
			userId: callback.userId,
			tokens,
			identity,
		});

		if (result.conflict) {
			const owner = result.conflict.ownerEmail
				? `&owner=${encodeURIComponent(result.conflict.ownerEmail)}`
				: "";
			return web(`?error=account_already_linked${owner}`);
		}
	} catch (error) {
		console.error(`[connectors/${slug}] callback failed:`, error);
		return web("?error=token_exchange_failed");
	}

	return web("?connected=1");
}
