import { env } from "../../env";
import {
	type AuthIdentity,
	credentialFetch,
	type PluginAuthMethod,
	readPath,
	resolveTemplateDeep,
	resolveUrlTemplate,
	type TemplateScope,
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

export function buildAuthorizationUrl(
	pluginName: string,
	auth: PluginAuthMethod,
	scope: TemplateScope,
	state: string,
): string {
	const credentials = clientCredentials(auth);
	if (!credentials) {
		throw new Error(`No OAuth client configured for plugin "${pluginName}".`);
	}
	if (!auth.authorization_url) {
		throw new Error(`Plugin "${pluginName}" declares no authorization_url.`);
	}

	const url = new URL(
		resolveUrlTemplate(
			auth.authorization_url,
			scope,
			auth,
			"authorization_url",
		),
	);
	url.searchParams.set("client_id", credentials.clientId);
	url.searchParams.set("redirect_uri", redirectUri(pluginName));
	url.searchParams.set("response_type", "code");
	url.searchParams.set("state", state);
	if (auth.scopes?.length) {
		url.searchParams.set(
			"scope",
			auth.scopes.join(auth.scope_separator ?? " "),
		);
	}
	return url.toString();
}

export interface ExchangedToken {
	accessToken: string;
	refreshToken: string | null;
	expiresAt: Date | null;
	scopes: string[] | null;
}

export async function exchangeCode(
	pluginName: string,
	auth: PluginAuthMethod,
	scope: TemplateScope,
	code: string,
): Promise<ExchangedToken> {
	const credentials = clientCredentials(auth);
	if (!credentials) {
		throw new Error(`No OAuth client configured for plugin "${pluginName}".`);
	}
	if (!auth.token_url) {
		throw new Error(`Plugin "${pluginName}" declares no token_url.`);
	}

	const body = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		redirect_uri: redirectUri(pluginName),
	});

	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
		Accept: "application/json",
	};

	if (auth.token_request_auth_method === "client_secret_basic") {
		const basic = Buffer.from(
			`${credentials.clientId}:${credentials.clientSecret}`,
		).toString("base64");
		headers.Authorization = `Basic ${basic}`;
	} else {
		body.set("client_id", credentials.clientId);
		body.set("client_secret", credentials.clientSecret);
	}

	const response = await credentialFetch(
		resolveUrlTemplate(auth.token_url, scope, auth, "token_url"),
		{ method: "POST", headers, body },
		"token_url",
	);

	if (!response.ok) {
		throw new Error(
			`Token exchange failed: ${response.status} ${await response.text()}`,
		);
	}

	const payload = (await response.json()) as {
		access_token?: string;
		refresh_token?: string;
		expires_in?: number;
		scope?: string;
		error?: string;
		error_description?: string;
	};

	if (payload.error || !payload.access_token) {
		throw new Error(
			payload.error_description ?? payload.error ?? "No access_token returned",
		);
	}

	const bufferSeconds = auth.token_expiration_buffer ?? 0;
	return {
		accessToken: payload.access_token,
		refreshToken: payload.refresh_token ?? null,
		expiresAt: payload.expires_in
			? new Date(Date.now() + (payload.expires_in - bufferSeconds) * 1000)
			: null,
		scopes: payload.scope
			? payload.scope.split(auth.scope_separator ?? " ").filter(Boolean)
			: (auth.scopes ?? null),
	};
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
