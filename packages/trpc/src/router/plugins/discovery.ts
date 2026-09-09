import { credentialFetch } from "./manifest";

export interface AuthorizationServerMetadata {
	issuer: string;
	authorization_endpoint: string;
	token_endpoint: string;
	registration_endpoint?: string;
	scopes_supported?: string[];
	grant_types_supported?: string[];
	code_challenge_methods_supported?: string[];
	token_endpoint_auth_methods_supported?: string[];
	client_id_metadata_document_supported?: boolean;
}

export interface DiscoveredServer {
	resource: string;
	issuer: string;
	metadata: AuthorizationServerMetadata;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; value: DiscoveredServer }>();

function wellKnown(base: URL, name: string): string[] {
	const path = base.pathname.replace(/\/$/, "");
	if (!path) return [`${base.origin}/.well-known/${name}`];
	return [
		`${base.origin}/.well-known/${name}${path}`,
		`${base.origin}${path}/.well-known/${name}`,
		`${base.origin}/.well-known/${name}`,
	];
}

function evictExpired(): void {
	const now = Date.now();
	for (const [key, entry] of cache) {
		if (now - entry.at >= CACHE_TTL_MS) cache.delete(key);
	}
}

function requireHttps(value: string, field: string, issuer: string): void {
	let parsed: URL;
	try {
		parsed = new URL(value);
	} catch {
		throw new Error(`${issuer} advertises a ${field} that is not a URL.`);
	}
	if (parsed.protocol !== "https:") {
		throw new Error(
			`${issuer} advertises a ${field} of ${parsed.protocol}//${parsed.host}; it must be https.`,
		);
	}
}

function sameIssuer(a: string, b: string): boolean {
	return a.replace(/\/$/, "") === b.replace(/\/$/, "");
}

async function fetchJson(urls: string[], what: string): Promise<unknown> {
	const failures: string[] = [];
	for (const url of urls) {
		let response: Response;
		try {
			response = await credentialFetch(url, { method: "GET" }, what);
		} catch (error) {
			failures.push(
				`${url}: ${error instanceof Error ? error.message : String(error)}`,
			);
			continue;
		}
		if (!response.ok) {
			failures.push(`${url}: ${response.status} ${response.statusText}`);
			continue;
		}
		try {
			return await response.json();
		} catch {
			failures.push(`${url}: response was not JSON`);
		}
	}
	throw new Error(`Could not read ${what} (${failures.join("; ")})`);
}

async function protectedResource(
	mcpUrl: string,
): Promise<{ resource: string; issuers: string[] }> {
	const base = new URL(mcpUrl);
	const payload = (await fetchJson(
		wellKnown(base, "oauth-protected-resource"),
		"protected resource metadata",
	)) as { resource?: string; authorization_servers?: string[] };

	const issuers = (payload.authorization_servers ?? []).filter(
		(entry) => typeof entry === "string" && entry.startsWith("https://"),
	);
	if (issuers.length === 0) {
		throw new Error(
			`${mcpUrl} names no https authorization server in its protected resource metadata.`,
		);
	}
	return { resource: payload.resource ?? mcpUrl, issuers };
}

async function authorizationServer(
	issuer: string,
): Promise<AuthorizationServerMetadata> {
	const base = new URL(issuer);
	const payload = (await fetchJson(
		[
			...wellKnown(base, "oauth-authorization-server"),
			...wellKnown(base, "openid-configuration"),
		],
		"authorization server metadata",
	)) as Partial<AuthorizationServerMetadata>;

	if (!payload.authorization_endpoint || !payload.token_endpoint) {
		throw new Error(
			`${issuer} advertises no authorization_endpoint or token_endpoint.`,
		);
	}
	requireHttps(
		payload.authorization_endpoint,
		"authorization_endpoint",
		issuer,
	);
	requireHttps(payload.token_endpoint, "token_endpoint", issuer);
	if (payload.registration_endpoint) {
		requireHttps(
			payload.registration_endpoint,
			"registration_endpoint",
			issuer,
		);
	}
	if (payload.issuer && !sameIssuer(payload.issuer, issuer)) {
		throw new Error(
			`${issuer} returned metadata for issuer "${payload.issuer}"; an authorization server may only describe the issuer it was requested from.`,
		);
	}
	return {
		...payload,
		issuer,
		authorization_endpoint: payload.authorization_endpoint,
		token_endpoint: payload.token_endpoint,
	};
}

export async function discoverServer(
	mcpUrl: string,
): Promise<DiscoveredServer> {
	const cached = cache.get(mcpUrl);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
	evictExpired();

	const { resource, issuers } = await protectedResource(mcpUrl);
	const failures: string[] = [];
	for (const issuer of issuers) {
		try {
			const value = {
				resource,
				issuer,
				metadata: await authorizationServer(issuer),
			};
			cache.set(mcpUrl, { at: Date.now(), value });
			return value;
		} catch (error) {
			failures.push(
				`${issuer}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	throw new Error(
		`No authorization server named by ${mcpUrl} could be read (${failures.join("; ")})`,
	);
}
