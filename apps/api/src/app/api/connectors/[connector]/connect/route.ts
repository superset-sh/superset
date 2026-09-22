import type { ConnectorMethod } from "@superset/shared/connectors";
import {
	authorizeUrl,
	connectorMethod,
	createCodeVerifier,
	MissingConnectorEnvError,
	redirectUriFor,
	requireConnector,
	resolveEndpoints,
	UnknownConnectorError,
} from "@superset/trpc/connectors";
import { encryptSecret } from "@superset/trpc/integrations/plugins";

import { env } from "@/env";
import { requireOrgMember } from "@/lib/integrations/requireOrgMember";
import { createSignedState } from "@/lib/oauth-state";

export const STATE_COOKIE = "connector_oauth_state";

export async function GET(
	request: Request,
	{ params }: { params: Promise<{ connector: string }> },
) {
	const { connector: slug } = await params;
	const member = await requireOrgMember(request);
	if (member instanceof Response) return member;

	// Same reason as the callback: the generic connect page covers every
	// connector, `/integrations/<slug>` only the seven older ones.
	const connectUrl = `${env.NEXT_PUBLIC_WEB_URL}/connect/${slug}`;
	const requested = new URL(request.url).searchParams.get("method");

	let method: ConnectorMethod;
	try {
		const connector = requireConnector(slug);
		method = connectorMethod(
			connector,
			(requested as ConnectorMethod["type"] | null) ?? undefined,
		);
	} catch (error) {
		if (error instanceof UnknownConnectorError)
			return Response.json({ error: "Unknown connector" }, { status: 404 });
		throw error;
	}

	if (method.type === "api_key")
		return Response.json(
			{ error: "This method takes inputs, not a redirect" },
			{ status: 400 },
		);

	let target: string;
	let state: string;
	try {
		const redirect = redirectUriFor(slug);
		const wantsPkce =
			method.type === "oauth2" &&
			(await resolveEndpoints(slug, method, redirect)).pkce;
		const codeVerifier = wantsPkce ? createCodeVerifier() : null;
		state = codeVerifier
			? createSignedState({
					organizationId: member.organizationId,
					userId: member.userId,
					codeVerifier: await encryptSecret(codeVerifier),
				})
			: member.state;

		target = (
			await authorizeUrl(slug, method, {
				redirectUri: redirect,
				state,
				codeVerifier,
			})
		).url;
	} catch (error) {
		if (error instanceof MissingConnectorEnvError) {
			console.error(`[connectors/${slug}] ${error.message}`);
			return Response.redirect(`${connectUrl}?error=not_configured`);
		}
		throw error;
	}

	const secure = env.NEXT_PUBLIC_API_URL.startsWith("https") ? " Secure;" : "";
	return new Response(null, {
		status: 302,
		headers: {
			Location: target,
			"Set-Cookie": `${STATE_COOKIE}=${state}; HttpOnly;${secure} SameSite=Lax; Path=/api/connectors; Max-Age=600`,
		},
	});
}
