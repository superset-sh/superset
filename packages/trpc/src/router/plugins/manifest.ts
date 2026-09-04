export const SUPERSET_EXTENSION = "superset";

/** The marketplace whose manifests we ship and review. */
export const FIRST_PARTY_MARKETPLACE = "superset";

export interface AuthInput {
	name: string;
	label?: string;
	placeholder?: string;
	description?: string;
	required?: boolean;
	secret?: boolean;
}

export interface AuthIdentity {
	url: string;
	method?: "GET" | "POST";
	headers?: Record<string, string>;
	body?: unknown;
	id: string;
	label?: string;
}

export interface PluginAuthMethod {
	type: "oauth2" | "api_key";
	label?: string;
	provider?: string;
	inputs?: AuthInput[];
	credential_input?: string;
	authorization_url?: string;
	token_url?: string;
	scopes?: string[];
	scope_separator?: string;
	token_request_auth_method?: string;
	token_expiration_buffer?: number;
	requires_env?: string[];
	identity?: AuthIdentity;
	bind?: PluginBind;
}

export type PluginAuth = PluginAuthMethod[];

export function authMethod(
	auth: PluginAuth | undefined,
	type?: string,
): PluginAuthMethod | undefined {
	if (!auth?.length) return undefined;
	if (!type) return auth.length === 1 ? auth[0] : undefined;
	return auth.find((method) => method.type === type);
}

export interface PluginMcp {
	type: "streamable-http";
	url: string;
	headers?: Record<string, string>;
}

export interface PluginBind {
	headers?: Record<string, string>;
	env?: Record<string, string>;
}

export interface PluginServer {
	path?: string;
	integrity?: string;
	ref?: string;
}

export interface SupersetExtension {
	interface?: { displayName: string; category?: string; icon?: string };
	auth?: PluginAuth;
	bind?: PluginBind;
	mcp?: PluginMcp;
	server?: PluginServer;
}

export interface PluginManifest {
	name: string;
	version: string;
	description?: string;
	extensions?: Record<string, SupersetExtension>;
}

export function supersetExtension(
	manifest: PluginManifest,
): SupersetExtension | undefined {
	return manifest.extensions?.[SUPERSET_EXTENSION];
}

export interface TemplateScope {
	config?: { access_token?: string; [key: string]: unknown };
	inputs?: Record<string, unknown>;
}

const TEMPLATE = /\$\{(config|inputs)\.([\w.-]+)\}/g;

const URL_STRUCTURE = /[/\\?#@:[\]%\s]|^$/;

export const DEFAULT_CREDENTIAL_INPUT = "api_key";

export function resolveTemplate(value: string, scope: TemplateScope): string {
	return value.replace(TEMPLATE, (whole, root: string, key: string) => {
		const source =
			root === "config"
				? (scope.config as Record<string, unknown> | undefined)
				: scope.inputs;
		const resolved = source?.[key];
		return resolved === undefined || resolved === null
			? whole
			: String(resolved);
	});
}

export function resolveUrlTemplate(
	value: string,
	scope: TemplateScope,
	auth?: PluginAuthMethod,
	what = "URL",
): string {
	const secrets = new Set(
		(auth?.inputs ?? [])
			.filter((input) => input.secret)
			.map((input) => input.name),
	);
	if (auth?.type === "api_key") {
		secrets.add(auth.credential_input ?? DEFAULT_CREDENTIAL_INPUT);
	}
	return value.replace(TEMPLATE, (whole, root: string, key: string) => {
		if (root === "config") {
			throw new Error(
				`${what} template expands \${config.${key}}, which is a credential; move it to a header or request body.`,
			);
		}
		if (secrets.has(key)) {
			throw new Error(
				`${what} template expands \${inputs.${key}}, which the manifest declares secret; move it to a header or request body.`,
			);
		}
		const resolved = scope.inputs?.[key];
		if (resolved === undefined || resolved === null) return whole;
		const text = String(resolved);
		if (URL_STRUCTURE.test(text)) {
			throw new Error(
				`${what} template expands \${inputs.${key}} to "${text}", which contains characters that would change the URL's host or path.`,
			);
		}
		return text;
	});
}

export function resolveTemplateDeep<T>(value: T, scope: TemplateScope): T {
	if (typeof value === "string") {
		return resolveTemplate(value, scope) as unknown as T;
	}
	if (Array.isArray(value)) {
		return value.map((item) =>
			resolveTemplateDeep(item, scope),
		) as unknown as T;
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			out[key] = resolveTemplateDeep(item, scope);
		}
		return out as T;
	}
	return value;
}

export function readPath(source: unknown, path: string): unknown {
	const trimmed = path.startsWith("$.") ? path.slice(2) : path;
	let current: unknown = source;

	for (const segment of trimmed.split(".")) {
		if (current === null || current === undefined) return undefined;
		const match = segment.match(/^([^[\]]*)((?:\[\d+\])*)$/);
		if (!match) return undefined;

		const [, key, indexes] = match;
		if (key) {
			if (typeof current !== "object") return undefined;
			current = (current as Record<string, unknown>)[key];
		}
		for (const index of indexes?.match(/\d+/g) ?? []) {
			if (!Array.isArray(current)) return undefined;
			current = current[Number(index)];
		}
	}

	return current;
}

export async function credentialFetch(
	url: string,
	init: RequestInit,
	what: string,
): Promise<Response> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		throw new Error(`${what} URL is not a URL: ${url}`);
	}
	if (parsed.protocol !== "https:") {
		throw new Error(
			`${what} URL must be https, got ${parsed.protocol}//${parsed.host}`,
		);
	}

	const response = await fetch(url, { ...init, redirect: "manual" });
	if (response.status >= 300 && response.status < 400) {
		throw new Error(
			`${what} URL redirected to ${response.headers.get("location") ?? "an unnamed location"}; refusing to resend the credential.`,
		);
	}
	return response;
}

/**
 * Whether a manifest may be trusted to name where a credential is sent.
 *
 * The identity probe posts the user's token to a URL the manifest chooses. For
 * a first-party plugin that URL is ours to review; for anything else it is an
 * exfiltration path, so the probe is skipped and the connection falls back to a
 * generated id with no label. Multi-account and reconnect still work — the
 * fallback is stable per auth method — the account just has no display name.
 */
export function trustedManifest(marketplace: string): boolean {
	return marketplace === FIRST_PARTY_MARKETPLACE;
}
