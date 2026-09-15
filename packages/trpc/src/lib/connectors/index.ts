import { randomBytes } from "node:crypto";
import {
	type Connector,
	type ConnectorMethod,
	getConnector,
} from "@superset/shared/connectors";
import { generateCodeChallenge } from "better-auth/oauth2";
import { credentialFetch, readPath } from "../../router/plugins/manifest";
import { forgetClient, resolveClientIdentity } from "./client-identity";
import { discoverServer, sameIssuer } from "./discovery";

const TEMPLATE = /\$\{(env|params|config)\.([\w.-]+)\}/g;

export interface ConnectorTemplateScope {
	env?: Record<string, string | undefined>;
	params?: Record<string, string | undefined>;
	config?: Record<string, unknown>;
}

export function resolveConnectorTemplate(
	value: string,
	scope: ConnectorTemplateScope,
): string {
	return value.replace(TEMPLATE, (whole, root: string, key: string) => {
		const source = (scope as Record<string, Record<string, unknown>>)[root];
		const resolved = source?.[key];
		return resolved === undefined || resolved === null
			? whole
			: String(resolved);
	});
}

export class UnknownConnectorError extends Error {
	constructor(slug: string) {
		super(`No connector named "${slug}" in connectors.json.`);
		this.name = "UnknownConnectorError";
	}
}

export class MissingConnectorEnvError extends Error {
	constructor(slug: string, missing: string[]) {
		super(`Connector "${slug}" needs ${missing.join(", ")}, which are unset.`);
		this.name = "MissingConnectorEnvError";
	}
}

export function requireConnector(slug: string): Connector {
	const connector = getConnector(slug);
	if (!connector) throw new UnknownConnectorError(slug);
	return connector;
}

export function connectorMethod(
	connector: Connector,
	type?: ConnectorMethod["type"],
): ConnectorMethod {
	const method = type
		? connector.methods.find((m) => m.type === type)
		: connector.methods[0];
	if (!method)
		throw new Error(`Connector has no ${type ?? "default"} auth method.`);
	return method;
}

export function connectorEnv(
	slug: string,
	method: ConnectorMethod,
): Record<string, string> {
	const resolved: Record<string, string> = {};
	const missing: string[] = [];
	for (const name of method.requires_env) {
		const value = process.env[name];
		if (value) resolved[name] = value;
		else missing.push(name);
	}
	if (missing.length) throw new MissingConnectorEnvError(slug, missing);
	return resolved;
}

export function clientCredentials(
	slug: string,
	method: ConnectorMethod,
): { clientId: string; clientSecret: string } {
	const env = connectorEnv(slug, method);
	const idName = method.requires_env.find((n) => n.endsWith("_CLIENT_ID"));
	if (!idName)
		throw new MissingConnectorEnvError(slug, ["<SERVICE>_CLIENT_ID"]);
	const secretName = idName.replace(/_CLIENT_ID$/, "_CLIENT_SECRET");
	const clientId = env[idName];
	const clientSecret = env[secretName];
	if (!clientId || !clientSecret)
		throw new MissingConnectorEnvError(slug, [idName, secretName]);
	return { clientId, clientSecret };
}

export interface ResolvedEndpoints {
	authorizationEndpoint: string;
	tokenEndpoint: string;
	clientId: string;
	clientSecret?: string;
	authentication?: "basic" | "post";
	resource?: string;
	pkce: boolean;
	issuer?: string;
	issuerParameterSupported?: boolean;
}

export async function resolveEndpoints(
	slug: string,
	method: ConnectorMethod,
	redirectUri: string,
): Promise<ResolvedEndpoints> {
	if (method.type !== "oauth2")
		throw new Error(`Connector "${slug}" is not an oauth2 method.`);

	if (method.client === "dynamic") {
		if (!method.authorization_url)
			throw new Error(
				`Connector "${slug}" uses a dynamic client but names no authorization_url to discover from.`,
			);
		const server = await discoverServer(method.authorization_url);
		const identity = await resolveClientIdentity(
			slug,
			server,
			method,
			redirectUri,
		);
		return {
			authorizationEndpoint: server.metadata.authorization_endpoint,
			tokenEndpoint: server.metadata.token_endpoint,
			clientId: identity.clientId,
			...(identity.clientSecret ? { clientSecret: identity.clientSecret } : {}),
			...(identity.authentication
				? { authentication: identity.authentication }
				: {}),
			resource: server.resource,
			pkce: true,
			issuer: server.issuer,
			issuerParameterSupported:
				server.metadata.authorization_response_iss_parameter_supported === true,
		};
	}

	const env = connectorEnv(slug, method);
	if (!method.authorization_url || !method.token_url)
		throw new Error(
			`Connector "${slug}" declares a static client but no authorization_url/token_url.`,
		);
	const { clientId, clientSecret } = clientCredentials(slug, method);
	return {
		authorizationEndpoint: resolveConnectorTemplate(method.authorization_url, {
			env,
		}),
		tokenEndpoint: resolveConnectorTemplate(method.token_url, { env }),
		clientId,
		clientSecret,
		authentication:
			method.token_request_auth_method === "client_secret_basic"
				? "basic"
				: "post",
		pkce: method.pkce,
	};
}

export function createCodeVerifier(): string {
	return randomBytes(32).toString("base64url");
}

export interface AuthorizeTarget {
	url: string;
	codeVerifier: string | null;
}

export async function authorizeUrl(
	slug: string,
	method: ConnectorMethod,
	options: { redirectUri: string; state: string; codeVerifier?: string | null },
): Promise<AuthorizeTarget> {
	const env = connectorEnv(slug, method);

	if (method.type === "app_install")
		return {
			url: resolveConnectorTemplate(method.install_url, { env }),
			codeVerifier: null,
		};

	if (method.type === "api_key")
		throw new Error(`Connector "${slug}" has no authorize URL.`);

	const endpoints =
		method.type === "oauth2"
			? await resolveEndpoints(slug, method, options.redirectUri)
			: null;

	const base =
		endpoints?.authorizationEndpoint ??
		(method.type === "admin_consent" ? method.consent_url : null);
	if (!base) throw new Error(`Connector "${slug}" has no authorize URL.`);
	const clientId =
		endpoints?.clientId ?? clientCredentials(slug, method).clientId;

	const url = new URL(resolveConnectorTemplate(base, { env }));
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("redirect_uri", options.redirectUri);
	url.searchParams.set("state", options.state);

	let codeVerifier: string | null = null;
	if (method.type === "oauth2") {
		url.searchParams.set("response_type", "code");
		if (endpoints?.resource)
			url.searchParams.set("resource", endpoints.resource);
		if (endpoints?.pkce) {
			codeVerifier = options.codeVerifier ?? createCodeVerifier();
			url.searchParams.set(
				"code_challenge",
				await generateCodeChallenge(codeVerifier),
			);
			url.searchParams.set("code_challenge_method", "S256");
		}
		if (method.scopes.length)
			url.searchParams.set(
				method.scope_identifier,
				method.scopes.join(method.scope_separator),
			);
		for (const [key, value] of Object.entries(
			method.authorization_params ?? {},
		))
			url.searchParams.set(key, resolveConnectorTemplate(value, { env }));
	} else {
		url.searchParams.set(
			"scope",
			method.scopes.join(method.scope_separator ?? " "),
		);
	}

	return { url: url.toString(), codeVerifier };
}

export interface ConnectorTokens {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: Date | null;
	scopes: string[] | null;
	stored: Record<string, unknown>;
	raw: Record<string, unknown>;
}

export class IssuerMismatchError extends Error {}

/**
 * RFC 9207. `state` proves the response is ours; only `iss` proves which
 * authorization server answered. A connector whose issuer comes from per-connect
 * discovery can otherwise be induced to redeem server A's code at server B.
 */
export function assertRespondingIssuer(
	slug: string,
	endpoints: ResolvedEndpoints,
	iss: string | null,
): void {
	if (!endpoints.issuer) return;
	if (iss === null) {
		if (!endpoints.issuerParameterSupported) return;
		throw new IssuerMismatchError(
			`Connector "${slug}": ${endpoints.issuer} advertises iss on the authorization response but returned none.`,
		);
	}
	if (!sameIssuer(iss, endpoints.issuer)) {
		throw new IssuerMismatchError(
			`Connector "${slug}": authorization response came from "${iss}", not the expected ${endpoints.issuer}.`,
		);
	}
}

export async function exchangeCode(
	slug: string,
	method: ConnectorMethod,
	options: {
		code: string;
		redirectUri: string;
		codeVerifier?: string | null;
		params?: Record<string, string | undefined>;
		issuer?: string | null;
	},
): Promise<ConnectorTokens> {
	if (method.type === "api_key")
		throw new Error(`Connector "${slug}" uses an api_key, not a code grant.`);

	const endpoints =
		method.type === "oauth2"
			? await resolveEndpoints(slug, method, options.redirectUri)
			: null;
	if (endpoints)
		assertRespondingIssuer(slug, endpoints, options.issuer ?? null);
	const env = connectorEnv(slug, method);
	const { clientId, clientSecret } = endpoints
		? {
				clientId: endpoints.clientId,
				clientSecret: endpoints.clientSecret ?? "",
			}
		: clientCredentials(slug, method);
	const tokenUrl =
		endpoints?.tokenEndpoint ??
		resolveConnectorTemplate(method.token_url ?? "", {
			env,
			params: options.params,
		});

	const body = new URLSearchParams({
		grant_type:
			method.type === "admin_consent"
				? method.grant_type
				: "authorization_code",
		redirect_uri: options.redirectUri,
	});
	if (method.type !== "admin_consent") body.set("code", options.code);
	if (options.codeVerifier) body.set("code_verifier", options.codeVerifier);
	if (method.type === "oauth2")
		for (const [key, value] of Object.entries(method.token_params ?? {}))
			body.set(key, value);
	if (method.type === "admin_consent")
		body.set("scope", method.scopes.join(method.scope_separator ?? " "));

	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};
	if (endpoints?.resource) body.set("resource", endpoints.resource);
	const basic =
		endpoints?.authentication === "basic" ||
		(!endpoints && method.token_request_auth_method === "client_secret_basic");
	if (basic)
		headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
	else {
		body.set("client_id", clientId);
		if (clientSecret) body.set("client_secret", clientSecret);
	}

	const response = await credentialFetch(
		tokenUrl,
		{ method: "POST", headers, body },
		`Connector "${slug}" token`,
	);
	const payload = (await response.json()) as Record<string, unknown>;
	if (!response.ok) {
		if (endpoints?.issuer && payload.error === "invalid_client")
			await forgetClient(endpoints.issuer, options.redirectUri, clientId);
		throw new Error(
			`Connector "${slug}" token exchange failed: ${response.status} ${JSON.stringify(payload).slice(0, 200)}`,
		);
	}

	const tokenPath = method.type === "oauth2" ? method.token : "$.access_token";
	const accessToken = readPath(payload, tokenPath);
	if (typeof accessToken !== "string" || !accessToken)
		throw new Error(`Connector "${slug}" returned no token at ${tokenPath}.`);

	const stored: Record<string, unknown> = {};
	if (method.type === "oauth2")
		for (const [key, path] of Object.entries(method.store))
			stored[key] = readPath(payload, path);

	const expiresIn = payload.expires_in;
	const rawScope = payload.scope;

	return {
		accessToken,
		refreshToken:
			typeof payload.refresh_token === "string" ? payload.refresh_token : null,
		expiresAt:
			typeof expiresIn === "number"
				? new Date(Date.now() + expiresIn * 1000)
				: null,
		scopes:
			typeof rawScope === "string"
				? rawScope.split(
						method.type === "oauth2" ? method.scope_separator : " ",
					)
				: null,
		stored,
		raw: payload,
	};
}

export interface ConnectorIdentity {
	account: { id: string; label: string | null };
	user: { id: string; label: string | null } | null;
}

export async function probeIdentity(
	slug: string,
	method: ConnectorMethod,
	accessToken: string,
	params?: Record<string, string | undefined>,
): Promise<ConnectorIdentity> {
	const env = connectorEnv(slug, method);
	const scope = { env, params, config: { access_token: accessToken } };
	const probe = method.identity;

	const url = resolveConnectorTemplate(probe.url, scope);
	const headers = Object.fromEntries(
		Object.entries(probe.headers ?? {}).map(([key, value]) => [
			key,
			resolveConnectorTemplate(value, scope),
		]),
	);

	const response = await credentialFetch(
		url,
		{
			method: probe.method,
			headers,
			body: probe.body ? JSON.stringify(probe.body) : undefined,
		},
		`Connector "${slug}" identity`,
	);
	const payload = (await response.json()) as Record<string, unknown>;
	if (!response.ok)
		throw new Error(
			`Connector "${slug}" identity probe failed: ${response.status}`,
		);

	const read = (path: string): string | null => {
		const value = readPath(payload, path);
		return value === undefined || value === null ? null : String(value);
	};

	const accountId = read(probe.account.id);
	if (!accountId)
		throw new Error(
			`Connector "${slug}" identity probe returned nothing at ${probe.account.id}.`,
		);

	const userId = probe.user ? read(probe.user.id) : null;

	return {
		account: {
			id: accountId,
			label: probe.account.label ? read(probe.account.label) : null,
		},
		user:
			probe.user && userId
				? {
						id: userId,
						label: probe.user.label ? read(probe.user.label) : null,
					}
				: null,
	};
}

export {
	decryptOptional,
	decryptSecret,
	encryptOptional,
	encryptSecret,
} from "../../router/plugins/crypto";
export {
	clientMetadataUrl,
	forgetClient,
	redirectUriFor,
} from "./client-identity";
export { type DiscoveredServer, discoverServer } from "./discovery";
export {
	accountConnection,
	accountConnections,
	type ConnectionLookupOptions,
	connectionBotToken,
	connectionById,
	connectorConnections,
	orgConnection,
	userConnection,
} from "./lookup";
export {
	connectionAccessToken,
	ensureFreshConnection,
	UnrefreshableConnectionError,
} from "./refresh";
export {
	activeConnection,
	type ConnectionConflict,
	type ConnectionSecrets,
	connectionConflict,
	connectionSecrets,
	type UpsertConnectionResult,
	upsertConnection,
} from "./upsert";
