import { randomBytes } from "node:crypto";
import {
	authorizationCodeRequest,
	createAuthorizationURL,
	getOAuth2Tokens,
	type OAuth2Tokens,
	type ProviderOptions,
	refreshAccessTokenRequest,
} from "better-auth/oauth2";
import { env } from "../../env";
import {
	type ClientIdentity,
	forgetClient,
	resolveClientIdentity,
} from "./client-identity";
import { type DiscoveredServer, discoverServer } from "./discovery";
import {
	type AuthIdentity,
	credentialFetch,
	type PluginAuthMethod,
	type PluginManifest,
	readPath,
	resolveTemplateDeep,
	resolveUrlTemplate,
	supersetExtension,
	type TemplateScope,
	tokenAuthentication,
	usesDynamicClient,
	usesPkce,
} from "./manifest";

/**
 * The variables a manifest may name. An OAuth client is a property of the
 * upstream product, not of the plugin, so a manifest has to be able to point
 * at a pair a sibling plugin already uses. It must not be able to point at an
 * unrelated secret: the token exchange POSTs whatever it reads to a
 * manifest-supplied token_url, so an unbounded name here would send our own
 * server secrets to a host the manifest chose.
 */
const CLIENT_ENV = /^PLUGIN_[A-Z0-9_]+_CLIENT_(ID|SECRET)$/;

export function clientCredentials(auth: PluginAuthMethod): {
	clientId: string;
	clientSecret: string;
} | null {
	const declared = (auth.requires_env ?? []).filter((name) =>
		CLIENT_ENV.test(name),
	);
	// The pair has to name one service. Taking the first id and the first
	// secret independently would post one product's client secret to another
	// product's token_url the moment a manifest named two.
	const clientId = declared.find((name) => name.endsWith("_CLIENT_ID"));
	if (!clientId) return null;
	const clientSecret = clientId.replace(/_CLIENT_ID$/, "_CLIENT_SECRET");
	if (!declared.includes(clientSecret)) return null;

	const id = process.env[clientId];
	const secret = process.env[clientSecret];
	return id && secret ? { clientId: id, clientSecret: secret } : null;
}

export function redirectUri(pluginName: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/plugins/callback/${pluginName}`;
}

export interface OAuthEndpoints {
	identity: ClientIdentity;
	authorizationEndpoint: string;
	tokenEndpoint: string;
	resource?: string;
	server?: DiscoveredServer;
}

function mcpUrlOf(pluginName: string, manifest?: PluginManifest): string {
	const url = manifest ? supersetExtension(manifest)?.mcp?.url : undefined;
	if (!url) {
		throw new Error(
			`Plugin "${pluginName}" sets client "dynamic" but declares no mcp url to discover an authorization server from.`,
		);
	}
	return url;
}

export async function resolveEndpoints(
	pluginName: string,
	auth: PluginAuthMethod,
	scope: TemplateScope,
	manifest?: PluginManifest,
	options: { forceRegister?: boolean } = {},
): Promise<OAuthEndpoints> {
	if (usesDynamicClient(auth)) {
		const server = await discoverServer(mcpUrlOf(pluginName, manifest));
		const identity = await resolveClientIdentity(
			pluginName,
			server,
			auth,
			redirectUri(pluginName),
			options,
		);
		return {
			identity,
			authorizationEndpoint: server.metadata.authorization_endpoint,
			tokenEndpoint: server.metadata.token_endpoint,
			resource: server.resource,
			server,
		};
	}

	const credentials = clientCredentials(auth);
	if (!credentials) {
		throw new Error(`No OAuth client configured for plugin "${pluginName}".`);
	}
	if (!auth.authorization_url) {
		throw new Error(`Plugin "${pluginName}" declares no authorization_url.`);
	}

	return {
		identity: {
			clientId: credentials.clientId,
			clientSecret: credentials.clientSecret,
			authentication: tokenAuthentication(auth) ?? "post",
		},
		authorizationEndpoint: resolveUrlTemplate(
			auth.authorization_url,
			scope,
			auth,
			"authorization_url",
		),
		tokenEndpoint: auth.token_url
			? resolveUrlTemplate(auth.token_url, scope, auth, "token_url")
			: "",
	};
}

function requireTokenEndpoint(
	pluginName: string,
	endpoints: OAuthEndpoints,
): string {
	if (!endpoints.tokenEndpoint) {
		throw new Error(`Plugin "${pluginName}" declares no token_url.`);
	}
	return endpoints.tokenEndpoint;
}

function providerOptions(
	pluginName: string,
	identity: ClientIdentity,
): Partial<ProviderOptions> {
	return {
		clientId: identity.clientId,
		clientSecret: identity.clientSecret,
		redirectURI: redirectUri(pluginName),
	};
}

export function createCodeVerifier(auth: PluginAuthMethod): string | null {
	return usesPkce(auth) ? randomBytes(32).toString("base64url") : null;
}

export async function buildAuthorizationUrl(
	pluginName: string,
	auth: PluginAuthMethod,
	scope: TemplateScope,
	state: string,
	options: { manifest?: PluginManifest; codeVerifier?: string | null } = {},
): Promise<string> {
	const endpoints = await resolveEndpoints(
		pluginName,
		auth,
		scope,
		options.manifest,
	);
	const codeVerifier = options.codeVerifier ?? null;

	const url = await createAuthorizationURL({
		id: pluginName,
		options: providerOptions(pluginName, endpoints.identity),
		authorizationEndpoint: endpoints.authorizationEndpoint,
		redirectURI: redirectUri(pluginName),
		state,
		...(codeVerifier ? { codeVerifier } : {}),
		...(auth.scopes?.length ? { scopes: auth.scopes } : {}),
		...(auth.scope_separator ? { scopeJoiner: auth.scope_separator } : {}),
		additionalParams: {
			...(endpoints.resource ? { resource: endpoints.resource } : {}),
			...(auth.authorization_params ?? {}),
		},
	});

	return url.toString();
}

async function postToken(
	tokenEndpoint: string,
	request: { body: URLSearchParams; headers: Record<string, string> },
	what: string,
): Promise<OAuth2Tokens> {
	const response = await credentialFetch(
		tokenEndpoint,
		{ method: "POST", headers: request.headers, body: request.body },
		what,
	);

	const payload = (await response.json().catch(() => null)) as {
		error?: string;
		error_description?: string;
	} | null;

	if (!response.ok || payload?.error) {
		const detail =
			payload?.error_description ??
			payload?.error ??
			`${response.status} ${response.statusText}`;
		throw new TokenRequestError(detail, payload?.error);
	}
	if (!payload) throw new TokenRequestError(`${what} returned no JSON body`);
	return getOAuth2Tokens(payload as Record<string, unknown>);
}

export class TokenRequestError extends Error {
	constructor(
		message: string,
		readonly code?: string,
	) {
		super(message);
	}
}

export interface ExchangedToken {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: Date | null;
	scopes: string[] | null;
}

function exchanged(
	tokens: OAuth2Tokens,
	auth: PluginAuthMethod,
): ExchangedToken {
	if (!tokens.accessToken) throw new Error("No access_token returned");

	const bufferSeconds = auth.token_expiration_buffer ?? 0;
	const raw = tokens.raw as { scope?: string } | undefined;
	const scopes = raw?.scope
		? raw.scope.split(auth.scope_separator ?? " ").filter(Boolean)
		: (auth.scopes ?? null);

	return {
		accessToken: tokens.accessToken,
		refreshToken: tokens.refreshToken ?? null,
		expiresAt: tokens.accessTokenExpiresAt
			? new Date(tokens.accessTokenExpiresAt.getTime() - bufferSeconds * 1000)
			: null,
		scopes: scopes?.length ? scopes : null,
	};
}

function unknownClient(error: unknown): boolean {
	return (
		error instanceof TokenRequestError &&
		(error.code === "invalid_client" || error.code === "unauthorized_client")
	);
}

async function withClientRetry<T>(
	pluginName: string,
	auth: PluginAuthMethod,
	endpoints: OAuthEndpoints,
	attempt: (endpoints: OAuthEndpoints) => Promise<T>,
	scope: TemplateScope,
	manifest?: PluginManifest,
): Promise<T> {
	try {
		return await attempt(endpoints);
	} catch (error) {
		if (
			!unknownClient(error) ||
			!usesDynamicClient(auth) ||
			!endpoints.server
		) {
			throw error;
		}
		await forgetClient(endpoints.server.issuer, redirectUri(pluginName));
		return await attempt(
			await resolveEndpoints(pluginName, auth, scope, manifest, {
				forceRegister: true,
			}),
		);
	}
}

export async function exchangeCode(
	pluginName: string,
	auth: PluginAuthMethod,
	scope: TemplateScope,
	code: string,
	options: { codeVerifier?: string | null; manifest?: PluginManifest } = {},
): Promise<ExchangedToken> {
	const endpoints = await resolveEndpoints(
		pluginName,
		auth,
		scope,
		options.manifest,
	);

	const tokens = await withClientRetry(
		pluginName,
		auth,
		endpoints,
		async (current) =>
			await postToken(
				requireTokenEndpoint(pluginName, current),
				await authorizationCodeRequest({
					code,
					redirectURI: redirectUri(pluginName),
					options: providerOptions(pluginName, current.identity),
					...(options.codeVerifier
						? { codeVerifier: options.codeVerifier }
						: {}),
					...(current.identity.authentication
						? { authentication: current.identity.authentication }
						: {}),
					...(current.resource ? { resource: current.resource } : {}),
					additionalParams: auth.token_params ?? {},
				}),
				"token_url",
			),
		scope,
		options.manifest,
	);

	return exchanged(tokens, auth);
}

export async function refreshToken(
	pluginName: string,
	auth: PluginAuthMethod,
	scope: TemplateScope,
	token: string,
	manifest?: PluginManifest,
): Promise<ExchangedToken> {
	const endpoints = await resolveEndpoints(pluginName, auth, scope, manifest);

	const tokens = await withClientRetry(
		pluginName,
		auth,
		endpoints,
		async (current) =>
			await postToken(
				requireTokenEndpoint(pluginName, current),
				await refreshAccessTokenRequest({
					refreshToken: token,
					options: providerOptions(pluginName, current.identity),
					...(current.identity.authentication
						? { authentication: current.identity.authentication }
						: {}),
					...(current.resource ? { resource: current.resource } : {}),
					...(auth.token_params ? { extraParams: auth.token_params } : {}),
				}),
				"token refresh",
			),
		scope,
		manifest,
	);

	return exchanged(tokens, auth);
}

export interface ResolvedIdentity {
	id: string;
	label: string | null;
}

export async function resolveIdentity(
	identity: AuthIdentity | undefined,
	scope: TemplateScope,
	fallbackId: string,
	auth?: PluginAuthMethod,
): Promise<ResolvedIdentity> {
	if (!identity) return { id: fallbackId, label: null };

	const method = identity.method ?? "GET";
	const headers = resolveTemplateDeep(identity.headers ?? {}, scope);
	const response = await credentialFetch(
		resolveUrlTemplate(identity.url, scope, auth, "identity.url"),
		{
			method,
			headers,
			body:
				method === "POST" && identity.body !== undefined
					? JSON.stringify(resolveTemplateDeep(identity.body, scope))
					: undefined,
		},
		"identity",
	);

	if (!response.ok) {
		throw new Error(
			`Identity request failed: ${response.status} ${response.statusText}`,
		);
	}

	const payload = await response.json();
	const id = readPath(payload, identity.id);
	if (id === undefined || id === null || id === "") {
		throw new Error(`Identity response has nothing at ${identity.id}`);
	}

	const label = identity.label ? readPath(payload, identity.label) : null;
	return {
		id: String(id),
		label: label === undefined || label === null ? null : String(label),
	};
}
