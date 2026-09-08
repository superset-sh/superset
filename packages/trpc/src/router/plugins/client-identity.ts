import { db } from "@superset/db/client";
import { pluginOauthClients } from "@superset/db/schema";
import { and, eq } from "drizzle-orm";
import { env } from "../../env";
import { decryptOptional, encryptOptional } from "./crypto";
import type { DiscoveredServer } from "./discovery";
import { credentialFetch, type PluginAuthMethod } from "./manifest";

export interface ClientIdentity {
	clientId: string;
	clientSecret?: string;
	authentication?: "basic" | "post";
}

export function clientMetadataUrl(pluginName: string): string {
	return `${env.NEXT_PUBLIC_API_URL}/api/plugins/${pluginName}/client-metadata`;
}

function pickAuthMethod(
	supported: string[] | undefined,
): "client_secret_post" | "client_secret_basic" | "none" {
	const methods = supported ?? ["client_secret_basic"];
	if (methods.includes("client_secret_post")) return "client_secret_post";
	if (methods.includes("client_secret_basic")) return "client_secret_basic";
	return "none";
}

function authenticationFor(
	method: string | null | undefined,
): "basic" | "post" | undefined {
	if (method === "client_secret_post") return "post";
	if (method === "client_secret_basic") return "basic";
	return undefined;
}

async function storedClient(
	issuer: string,
	redirectUri: string,
): Promise<ClientIdentity | null> {
	const [row] = await db
		.select()
		.from(pluginOauthClients)
		.where(
			and(
				eq(pluginOauthClients.issuer, issuer),
				eq(pluginOauthClients.redirectUri, redirectUri),
			),
		)
		.limit(1);
	if (!row) return null;
	if (row.clientSecretExpiresAt && row.clientSecretExpiresAt <= new Date()) {
		return null;
	}

	const secret = await decryptOptional(row.clientSecret);
	return {
		clientId: row.clientId,
		...(secret ? { clientSecret: secret } : {}),
		...(authenticationFor(row.tokenEndpointAuthMethod)
			? { authentication: authenticationFor(row.tokenEndpointAuthMethod) }
			: {}),
	};
}

async function register(
	pluginName: string,
	server: DiscoveredServer,
	auth: PluginAuthMethod,
	redirectUri: string,
): Promise<ClientIdentity> {
	const endpoint = server.metadata.registration_endpoint;
	if (!endpoint) {
		throw new Error(
			`${server.issuer} supports neither a client id metadata document nor dynamic client registration, so "${pluginName}" cannot obtain a client. Give it a static authorization_url, token_url, and requires_env instead.`,
		);
	}

	const tokenEndpointAuthMethod = pickAuthMethod(
		server.metadata.token_endpoint_auth_methods_supported,
	);
	const response = await credentialFetch(
		endpoint,
		{
			method: "POST",
			headers: {
				"content-type": "application/json",
				accept: "application/json",
			},
			body: JSON.stringify({
				client_name: "Superset",
				client_uri: "https://superset.sh",
				redirect_uris: [redirectUri],
				grant_types: ["authorization_code", "refresh_token"],
				response_types: ["code"],
				application_type: "web",
				token_endpoint_auth_method: tokenEndpointAuthMethod,
				...(auth.scopes?.length
					? { scope: auth.scopes.join(auth.scope_separator ?? " ") }
					: {}),
			}),
		},
		"client registration",
	);

	if (!response.ok) {
		throw new Error(
			`Dynamic client registration with ${server.issuer} failed: ${response.status} ${await response.text()}`,
		);
	}

	const payload = (await response.json()) as {
		client_id?: string;
		client_secret?: string;
		client_secret_expires_at?: number;
		registration_access_token?: string;
		registration_client_uri?: string;
		token_endpoint_auth_method?: string;
	};
	if (!payload.client_id) {
		throw new Error(
			`${server.issuer} returned no client_id from dynamic client registration.`,
		);
	}

	const method = payload.token_endpoint_auth_method ?? tokenEndpointAuthMethod;
	const expiresAt =
		payload.client_secret_expires_at && payload.client_secret_expires_at > 0
			? new Date(payload.client_secret_expires_at * 1000)
			: null;

	await db
		.insert(pluginOauthClients)
		.values({
			issuer: server.issuer,
			redirectUri,
			clientId: payload.client_id,
			clientSecret: await encryptOptional(payload.client_secret),
			clientSecretExpiresAt: expiresAt,
			registrationAccessToken: await encryptOptional(
				payload.registration_access_token,
			),
			registrationClientUri: payload.registration_client_uri ?? null,
			tokenEndpointAuthMethod: method,
		})
		.onConflictDoUpdate({
			target: [pluginOauthClients.issuer, pluginOauthClients.redirectUri],
			set: {
				clientId: payload.client_id,
				clientSecret: await encryptOptional(payload.client_secret),
				clientSecretExpiresAt: expiresAt,
				registrationAccessToken: await encryptOptional(
					payload.registration_access_token,
				),
				registrationClientUri: payload.registration_client_uri ?? null,
				tokenEndpointAuthMethod: method,
			},
		});

	return {
		clientId: payload.client_id,
		...(payload.client_secret ? { clientSecret: payload.client_secret } : {}),
		...(authenticationFor(method)
			? { authentication: authenticationFor(method) }
			: {}),
	};
}

export async function resolveClientIdentity(
	pluginName: string,
	server: DiscoveredServer,
	auth: PluginAuthMethod,
	redirectUri: string,
	options: { forceRegister?: boolean } = {},
): Promise<ClientIdentity> {
	if (server.metadata.client_id_metadata_document_supported) {
		return { clientId: clientMetadataUrl(pluginName) };
	}

	if (!options.forceRegister) {
		const existing = await storedClient(server.issuer, redirectUri);
		if (existing) return existing;
	}
	return await register(pluginName, server, auth, redirectUri);
}

export async function forgetClient(
	issuer: string,
	redirectUri: string,
): Promise<void> {
	await db
		.delete(pluginOauthClients)
		.where(
			and(
				eq(pluginOauthClients.issuer, issuer),
				eq(pluginOauthClients.redirectUri, redirectUri),
			),
		);
}
