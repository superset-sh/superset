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
import { STATE_COOKIE } from "@/app/api/connectors/[connector]/connect/route";
import { env } from "@/env";
import { resolveCallback } from "@/lib/integrations/resolveCallback";
import { connectorStateSchema, verifySignedState } from "@/lib/oauth-state";

function callbackParams(method: ConnectorMethod): string[] {
	if (method.type === "oauth2") return ["code"];
	if (method.type === "app_install" || method.type === "admin_consent")
		return [...method.callback_params];
	return [];
}

function stateCookie(request: Request): string | null {
	const cookie = request.headers.get("cookie") ?? "";
	const match = cookie.match(new RegExp(`(?:^|;\\s*)${STATE_COOKIE}=([^;]+)`));
	return match?.[1] ?? null;
}

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ connector: string }> },
) {
	const { connector: slug } = await params;
	const settingsUrl = `${env.NEXT_PUBLIC_WEB_URL}/integrations/${slug}`;
	const web = (query: string) => Response.redirect(`${settingsUrl}${query}`);

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
		redirect: (error) => web(`?error=${error}`),
		stateFrom: method.type === "app_install" ? stateCookie : undefined,
	});
	if (callback instanceof Response) return callback;

	// The signed state proves who asked, not who is answering. Without this the
	// authorization code a victim approves can be paired with a state minted by
	// an attacker, binding the victim's account to the attacker's connection.
	if (method.type !== "app_install") {
		const query = new URL(request.url).searchParams.get("state");
		if (!query || query !== stateCookie(request))
			return web("?error=invalid_state");
	}

	try {
		const rawState =
			method.type === "app_install"
				? stateCookie(request)
				: new URL(request.url).searchParams.get("state");
		const carried = rawState
			? verifySignedState(rawState, connectorStateSchema)
			: null;
		const codeVerifier = carried?.codeVerifier
			? await decryptSecret(carried.codeVerifier)
			: null;

		const tokens = await exchangeCode(slug, method, {
			code: callback.params.code ?? "",
			redirectUri: redirectUriFor(slug),
			codeVerifier,
			params: callback.params,
			issuer: new URL(request.url).searchParams.get("iss"),
		});

		const identity = await probeIdentity(
			slug,
			method,
			tokens.accessToken,
			callback.params,
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

	return web("");
}
